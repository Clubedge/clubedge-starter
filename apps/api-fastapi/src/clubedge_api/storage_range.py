"""Reads a request's Range header, as parseByteRange in packages/storage does for the TypeScript
apps."""

import re
import sys
from typing import Literal

from clubedge_api.storage_provider import ByteRange

_RANGE = re.compile(r"bytes=([0-9]*)-([0-9]*)", re.IGNORECASE)


def _number(digits: str) -> int:
    """The number `digits` spell. Python refuses to read thousands of digits, so a number longer
    than any object's size reads as one past every object's end."""
    digits = digits.lstrip("0")
    return sys.maxsize if len(digits) > 18 else int(digits or "0")


def parse_byte_range(header: str | None, size: int) -> ByteRange | Literal["unsatisfiable"] | None:
    """The bytes an HTTP Range header asks for of an object of `size` bytes, as browsers ask for a
    video's: one range ("bytes=0-", "bytes=500-999", or the last bytes, "bytes=-500"). The range
    it returns always has its `end`. None to send the whole object: no header, one this doesn't
    read (several ranges, other units), or one that isn't valid, which HTTP says to ignore.
    "unsatisfiable" when it starts past the end."""
    if not header or size <= 0:
        return None
    match = _RANGE.fullmatch(header.strip())
    if not match:
        return None
    first, last = match.groups()
    if not first and not last:
        return None
    if not first:
        # The last bytes.
        suffix = _number(last)
        if suffix == 0:
            return "unsatisfiable"
        return ByteRange(max(0, size - suffix), size - 1)
    start = _number(first)
    if last and _number(last) < start:
        return None
    if start >= size:
        return "unsatisfiable"
    return ByteRange(start, min(_number(last), size - 1) if last else size - 1)
