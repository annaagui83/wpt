from enum import IntEnum
from typing import Any, Dict, Iterator, List, Optional, Tuple

# TODO(bashi): Remove import check suppressions once aioquic dependency is
# resolved.
from aioquic.buffer import UINT_VAR_MAX_SIZE, Buffer, BufferReadError  # type: ignore


class CapsuleType(IntEnum):
    # Defined in
    # https://www.ietf.org/archive/id/draft-ietf-masque-h3-datagram-03.html.
    DATAGRAM = 0xff37a0
    REGISTER_DATAGRAM_CONTEXT = 0xff37a1
    REGISTER_DATAGRAM_NO_CONTEXT = 0xff37a2
    CLOSE_DATAGRAM_CONTEXT = 0xff37a3
    # Defined in
    # https://www.ietf.org/archive/id/draft-ietf-webtrans-http3-01.html.
    CLOSE_WEBTRANSPORT_SESSION = 0x2843


class H3Capsule:
    """
    Represents the Capsule concept defined in
    https://ietf-wg-masque.github.io/draft-ietf-masque-h3-datagram/draft-ietf-masque-h3-datagram.html#name-capsules.
    """
    def __init__(self, type: int, data: bytes) -> None:
        self.type = type
        self.data = data

    def encode(self) -> bytes:
        """
        Encodes this H3Capsule and return the bytes.
        """
        buffer = Buffer(capacity=len(self.data) + 2 * UINT_VAR_MAX_SIZE)
        buffer.push_uint_var(self.type)
        buffer.push_uint_var(len(self.data))
        buffer.push_bytes(self.data)
        return buffer.data


class H3CapsuleDecoder:
    """
    A decoder of H3Capsule. This is a streaming decoder and can handle multiple
    decoders.
    """
    def __init__(self) -> None:
        self._buffer: Optional[Buffer] = None
        self._type: Optional[Int] = None
        self._length: Optional[Int] = None
        self._final: bool = False

    def append(self, bs: bytes) -> None:
        """
        Appends the given bytes to this decoder.
        """
        assert not self._final

        if self._buffer:
            remaining = self._buffer.pull_bytes(
                self._buffer.capacity - self._buffer.tell())
            self._buffer = Buffer(data=(remaining + bs))
        else:
            self._buffer = Buffer(data=bs)

    def final(self) -> None:
        """
        Pushes the end-of-stream mark to this decoder. After calling this,
        calling append() will be invalid.
        """
        self._final = True

    def __iter__(self) -> Iterator[H3Capsule]:
        try:
            while self._buffer is not None:
                position = self._buffer.tell()
                if self._type is None:
                    self._type = self._buffer.pull_uint_var()
                if self._length is None:
                    self._length = self._buffer.pull_uint_var()
                if self._buffer.capacity - self._buffer.tell() < self._length:
                    if self._final:
                        raise ValueError('insufficient buffer')
                    return
                capsule = H3Capsule(
                    self._type, self._buffer.pull_bytes(self._length))
                self._type = None
                self._length = None
                if self._buffer.tell() == self._buffer.capacity:
                    self._buffer = None
                yield capsule
        except BufferReadError as e:
            if self._final:
                raise e
            size = self._buffer.capacity - self._buffer.tell()
            if size >= UINT_VAR_MAX_SIZE:
                raise e
            # Ignore the error because there may not be sufficient input.
            return
