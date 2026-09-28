"""Reads a STEP file into an XCAF document that keeps names, colours and the assembly tree."""

from dataclasses import dataclass
from pathlib import Path

from OCP.collections import Sequence_TCollection_AsciiString
from OCP.IFSelect import IFSelect_RetDone
from OCP.Message import Message_ProgressRange
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_LengthUnit

from pantin_step_converter.errors import UnusableStepFileError
from pantin_step_converter.units import source_unit_symbol


@dataclass(frozen=True)
class StepDocument:
    document: TDocStd_Document
    source_unit: str
    # OpenCascade stores shapes in the document unit (millimetre by default),
    # not in the file unit: tessellation tolerances are expressed in it.
    document_unit_in_metres: float


def read_step(input_path: Path) -> StepDocument:
    if not input_path.is_file():
        raise UnusableStepFileError(f"The input file {input_path.name} does not exist.")
    if input_path.stat().st_size == 0:
        raise UnusableStepFileError("The file is empty. Export the model again as STEP.")

    reader = STEPCAFControl_Reader()
    # Name mode keeps the component names of the CAD, which become body names.
    reader.SetNameMode(True)
    if reader.ReadFile(str(input_path)) != IFSelect_RetDone:
        raise UnusableStepFileError(
            "The file could not be read as STEP. Export the model as STEP (AP203, AP214 or AP242)."
        )
    document = TDocStd_Document(TCollection_ExtendedString("pantin-step-converter"))
    if not reader.Transfer(document, Message_ProgressRange()):
        raise UnusableStepFileError(
            "The STEP file contains no shape that could be transferred. "
            "Check that the export includes solid bodies."
        )
    return StepDocument(
        document=document,
        source_unit=source_unit_symbol(_file_length_unit_names(reader)),
        document_unit_in_metres=_document_unit_in_metres(document),
    )


def _file_length_unit_names(reader: STEPCAFControl_Reader) -> list[str]:
    length_names = Sequence_TCollection_AsciiString()
    angle_names = Sequence_TCollection_AsciiString()
    solid_angle_names = Sequence_TCollection_AsciiString()
    reader.ChangeReader().FileUnits(length_names, angle_names, solid_angle_names)
    return [
        str(length_names.Value(index).ToCString()) for index in range(1, length_names.Length() + 1)
    ]


def _document_unit_in_metres(document: TDocStd_Document) -> float:
    length_unit = XCAFDoc_LengthUnit()
    if not document.Main().Root().FindAttribute(XCAFDoc_LengthUnit.GetID_s(), length_unit):
        # Without the attribute, OpenCascade works in millimetres.
        return 0.001
    return float(length_unit.GetUnitValue())
