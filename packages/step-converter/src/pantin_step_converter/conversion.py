"""Converts a STEP file into one GLB per leaf component and describes the result."""

import json
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path

from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID

from pantin_step_converter.assembly import LeafComponent, SourceNode, find_leaf_components
from pantin_step_converter.errors import (
    ConverterError,
    FaceMapMismatchError,
    UnusableStepFileError,
)
from pantin_step_converter.face_map import build_face_file
from pantin_step_converter.glb_export import export_component_glb, tessellate
from pantin_step_converter.ocp_helpers import count_subshapes
from pantin_step_converter.step_reader import StepDocument, read_step

# The OpenCascade binding that wrote the GLB: the face map relies on its writer.
_WRITER = f"cadquery-ocp-novtk {version('cadquery-ocp-novtk')}"


@dataclass(frozen=True)
class ConvertedComponent:
    file: str
    name: str
    nodes: tuple[SourceNode, ...]
    # Exactly one is set: the face file (ADR 0035), or the reason it could not be built.
    face_file: str | None
    face_file_problem: str | None


@dataclass(frozen=True)
class ConversionResult:
    source_unit: str
    components: tuple[ConvertedComponent, ...]

    def to_json(self) -> dict[str, object]:
        """The stdout object of the process contract (ADR 0009)."""
        return {
            "sourceUnit": self.source_unit,
            "components": [
                {
                    "file": component.file,
                    "faceFile": component.face_file,
                    "name": component.name,
                    "nodes": [
                        {"name": node.name, "path": list(node.path)} for node in component.nodes
                    ],
                }
                for component in self.components
            ],
        }


def convert_step(input_path: Path, output_dir: Path) -> ConversionResult:
    if not output_dir.is_dir():
        raise ConverterError(f"The output directory {output_dir} does not exist.")
    step = read_step(input_path)
    components = _visible_components(find_leaf_components(step.document))

    converted = tuple(
        _convert_component(step, component, output_dir, index)
        for index, component in enumerate(components)
    )
    return ConversionResult(source_unit=step.source_unit, components=converted)


def _convert_component(
    step: StepDocument, component: LeafComponent, output_dir: Path, index: int
) -> ConvertedComponent:
    glb_name = f"{index}.glb"
    face_file_name = f"{index}.faces.json"
    tessellate(component.shape, step.document_unit_in_metres)
    converter = export_component_glb(step.document, component, output_dir / glb_name)
    try:
        face_file = build_face_file(
            step.document,
            component,
            output_dir / glb_name,
            converter,
            step.document_unit_in_metres,
        )
    except FaceMapMismatchError as error:
        return ConvertedComponent(glb_name, component.name, component.nodes, None, str(error))
    (output_dir / face_file_name).write_text(
        json.dumps(face_file.to_json(_WRITER), separators=(",", ":")), encoding="utf-8"
    )
    return ConvertedComponent(glb_name, component.name, component.nodes, face_file_name, None)


def _visible_components(components: list[LeafComponent]) -> list[LeafComponent]:
    """Keep the components that have faces to draw, and require at least one solid.

    Wires, points and construction geometry would give empty meshes. A file
    with surfaces but no solid at all is most likely a wrong export setting.
    """
    if not any(count_subshapes(component.shape, TopAbs_SOLID) for component in components):
        raise UnusableStepFileError(
            "The STEP file contains no solid body. "
            "Export the model with its solids (not only wireframe or surfaces)."
        )
    return [component for component in components if count_subshapes(component.shape, TopAbs_FACE)]
