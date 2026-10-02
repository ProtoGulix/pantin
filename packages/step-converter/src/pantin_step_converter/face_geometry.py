"""Exact geometry of a B-rep face, for alignment by picked faces (ADR 0035)."""

from dataclasses import dataclass

from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
from OCP.gp import gp_Dir, gp_Pnt, gp_Trsf
from OCP.TopAbs import TopAbs_REVERSED
from OCP.TopoDS import TopoDS_Face

Vector3 = tuple[float, float, float]


@dataclass(frozen=True)
class PlaneFace:
    point: Vector3
    # Points out of the material (spike 0008: checked on 697 planes).
    normal: Vector3

    def to_json(self) -> dict[str, object]:
        return {"kind": "plane", "point": list(self.point), "normal": list(self.normal)}


@dataclass(frozen=True)
class CylinderFace:
    point: Vector3
    # The B-rep axis direction: its sign is arbitrary.
    direction: Vector3
    radius: float

    def to_json(self) -> dict[str, object]:
        return {
            "kind": "cylinder",
            "point": list(self.point),
            "direction": list(self.direction),
            "radius": self.radius,
        }


@dataclass(frozen=True)
class OtherFace:
    def to_json(self) -> dict[str, object]:
        return {"kind": "other"}


FaceGeometry = PlaneFace | CylinderFace | OtherFace


def describe_face(face: TopoDS_Face, placement: gp_Trsf, metres_per_unit: float) -> FaceGeometry:
    """Geometry of a face given in its part's frame, moved by `placement`, in metres.

    The face must come from the reference shape of its part, unlocated: mixing
    it with a shape already located by the assembly gives wrong frames
    (spike 0008).
    """
    surface = BRepAdaptor_Surface(face, True)
    surface_type = surface.GetType()
    if surface_type == GeomAbs_Plane:
        axis = surface.Plane().Axis()
        normal = axis.Direction()
        if face.Orientation() == TopAbs_REVERSED:
            normal.Reverse()
        return PlaneFace(
            _point_in_metres(axis.Location(), placement, metres_per_unit),
            _direction(normal, placement),
        )
    if surface_type == GeomAbs_Cylinder:
        cylinder = surface.Cylinder()
        axis = cylinder.Axis()
        return CylinderFace(
            _point_in_metres(axis.Location(), placement, metres_per_unit),
            _direction(axis.Direction(), placement),
            cylinder.Radius() * metres_per_unit,
        )
    return OtherFace()


def _point_in_metres(point: gp_Pnt, placement: gp_Trsf, metres_per_unit: float) -> Vector3:
    moved = point.Transformed(placement)
    return (
        moved.X() * metres_per_unit,
        moved.Y() * metres_per_unit,
        moved.Z() * metres_per_unit,
    )


def _direction(direction: gp_Dir, placement: gp_Trsf) -> Vector3:
    moved = direction.Transformed(placement)
    return (moved.X(), moved.Y(), moved.Z())
