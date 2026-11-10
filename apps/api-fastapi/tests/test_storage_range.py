"""A request's Range header read into the bytes to send, with the cases the TypeScript apps'
parseByteRange has (packages/storage/src/range.test.ts)."""

from clubedge_api.storage_provider import ByteRange
from clubedge_api.storage_range import parse_byte_range


def test_reads_one_range_as_browsers_ask_for_a_videos_bytes() -> None:
    assert parse_byte_range("bytes=0-1", 1_000) == ByteRange(0, 1)
    assert parse_byte_range("bytes=0-", 1_000) == ByteRange(0, 999)
    assert parse_byte_range("bytes=500-999", 1_000) == ByteRange(500, 999)
    assert parse_byte_range(" bytes=10-20 ", 1_000) == ByteRange(10, 20)
    assert parse_byte_range("BYTES=10-20", 1_000) == ByteRange(10, 20)


def test_stops_a_range_at_the_objects_end() -> None:
    assert parse_byte_range("bytes=900-5000", 1_000) == ByteRange(900, 999)


def test_reads_the_last_bytes() -> None:
    assert parse_byte_range("bytes=-100", 1_000) == ByteRange(900, 999)
    assert parse_byte_range("bytes=-5000", 1_000) == ByteRange(0, 999)


def test_cannot_satisfy_a_range_past_the_end_or_none_of_the_last_bytes() -> None:
    assert parse_byte_range("bytes=1000-", 1_000) == "unsatisfiable"
    assert parse_byte_range("bytes=2000-3000", 1_000) == "unsatisfiable"
    assert parse_byte_range("bytes=-0", 1_000) == "unsatisfiable"


def test_sends_the_whole_object_for_what_it_does_not_read() -> None:
    assert parse_byte_range(None, 1_000) is None
    assert parse_byte_range("", 1_000) is None
    assert parse_byte_range("bytes=-", 1_000) is None
    assert parse_byte_range("bytes=0-1,5-6", 1_000) is None
    assert parse_byte_range("items=0-1", 1_000) is None
    assert parse_byte_range("bytes=20-10", 1_000) is None
    assert parse_byte_range("bytes=a-b", 1_000) is None
    # Its size unknown.
    assert parse_byte_range("bytes=0-1", 0) is None


def test_reads_numbers_of_any_length() -> None:
    huge = "9" * 5_000
    assert parse_byte_range(f"bytes={huge}-", 1_000) == "unsatisfiable"
    assert parse_byte_range(f"bytes=0-{huge}", 1_000) == ByteRange(0, 999)
    assert parse_byte_range(f"bytes=-{huge}", 1_000) == ByteRange(0, 999)
    assert parse_byte_range(f"bytes={'0' * 5_000}5-", 1_000) == ByteRange(5, 999)


def test_writes_a_range_as_a_range_header() -> None:
    assert ByteRange(0, 499).header() == "bytes=0-499"
    assert ByteRange(500).header() == "bytes=500-"
    assert ByteRange(0, 0).header() == "bytes=0-0"
