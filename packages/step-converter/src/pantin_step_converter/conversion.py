"""Converts a STEP file into one GLB per leaf component and describes the result."""

from dataclasses import dataclass
from pathlib import Path

from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID

from pantin_step_converter.assembly import LeafComponent, SourceNode, find_leaf_components
from pantin_step_converter.errors import ConverterError, UnusableStepFileError
from pantin_step_converter.glb_export import export_component_glb, tessellate
from pantin_step_converter.ocp_helpers import count_subshapes
from pantin_step_converter.step_reader import read_step


@dataclass(frozen=True)
class ConvertedComponent:
    file: str
    name: str
    nodes: tuple[SourceNode, ...]


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

    converted: list[ConvertedComponent] = []
    for index, component in enumerate(components):
        file_name = f"{index}.glb"
        tessellate(component.shape, step.document_unit_in_metres)
        export_component_glb(step.document, component, output_dir / file_name)
        converted.append(ConvertedComponent(file_name, component.name, component.nodes))
    return ConversionResult(source_unit=step.source_unit, components=tuple(converted))


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
