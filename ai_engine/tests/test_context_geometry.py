"""Unit tests for the Phase 9 context geometry helpers."""

import pytest

from context.geometry import (
    Point,
    distance_point_to_segment,
    normalize_point,
    point_in_polygon,
    segments_intersect,
    side_of_line,
    validate_point,
    validate_polygon,
)


SQUARE = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 0.0}, {"x": 1.0, "y": 1.0}, {"x": 0.0, "y": 1.0}]


class TestNormalize:
    def test_center(self):
        assert normalize_point(320, 240, 640, 480) == {"x": 0.5, "y": 0.5}

    def test_bottom_center_reference(self):
        # Bottom-center of bbox (x=(x1+x2)/2, y=y2).
        assert normalize_point(320, 480, 640, 480) == {"x": 0.5, "y": 1.0}

    def test_clamps_out_of_range(self):
        assert normalize_point(-10, 500, 100, 100)["x"] == 0.0
        assert normalize_point(1000, 500, 100, 100)["x"] == 1.0

    def test_zero_dimension_raises(self):
        with pytest.raises(ValueError):
            normalize_point(1, 1, 0, 0)


class TestValidation:
    def test_validate_point_ok(self):
        p = validate_point({"x": 0.5, "y": 0.5})
        assert isinstance(p, Point)

    def test_validate_point_out_of_range(self):
        with pytest.raises(ValueError):
            validate_point({"x": 1.5, "y": 0.5})

    def test_validate_polygon_needs_three(self):
        with pytest.raises(ValueError):
            validate_polygon([{"x": 0, "y": 0}, {"x": 1, "y": 0}])


class TestPointInPolygon:
    def test_inside(self):
        assert point_in_polygon({"x": 0.5, "y": 0.5}, SQUARE) is True

    def test_outside(self):
        small = [{"x": 0.2, "y": 0.2}, {"x": 0.8, "y": 0.2}, {"x": 0.8, "y": 0.8}, {"x": 0.2, "y": 0.8}]
        assert point_in_polygon({"x": 0.5, "y": 0.95}, small) is False
        assert point_in_polygon({"x": 0.5, "y": 0.5}, small) is True

    def test_on_boundary_counts_inside(self):
        assert point_in_polygon({"x": 0.5, "y": 0.0}, SQUARE) is True

    def test_triangle(self):
        tri = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 0.0}, {"x": 0.0, "y": 1.0}]
        assert point_in_polygon({"x": 0.1, "y": 0.1}, tri) is True
        assert point_in_polygon({"x": 0.8, "y": 0.8}, tri) is False


class TestSegmentsIntersect:
    def test_crossing(self):
        assert segments_intersect(
            {"x": 0.2, "y": 0.8}, {"x": 0.8, "y": 0.2},
            {"x": 0.2, "y": 0.2}, {"x": 0.8, "y": 0.8},
        ) is True

    def test_no_crossing(self):
        assert segments_intersect(
            {"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 0.0},
            {"x": 0.0, "y": 0.5}, {"x": 1.0, "y": 0.5},
        ) is False


class TestDistancePointToSegment:
    def test_perpendicular(self):
        d = distance_point_to_segment({"x": 0.5, "y": 0.5}, {"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 0.0})
        assert d == pytest.approx(0.5)

    def test_endpoint_projection(self):
        # Point directly above the segment interior -> perpendicular distance.
        d = distance_point_to_segment(
            {"x": 0.5, "y": 0.5},
            {"x": 0.2, "y": 0.0},
            {"x": 0.8, "y": 0.0},
        )
        assert d == pytest.approx(0.5)


class TestSideOfLine:
    def test_opposite_sides(self):
        a, b = {"x": 0.0, "y": 0.5}, {"x": 1.0, "y": 0.5}
        above = side_of_line({"x": 0.5, "y": 0.2}, a, b)
        below = side_of_line({"x": 0.5, "y": 0.8}, a, b)
        assert (above > 0) != (below > 0)
