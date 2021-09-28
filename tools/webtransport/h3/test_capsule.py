import unittest

from capsule import H3Capsule, H3CapsuleDecoder
from aioquic.buffer import BufferReadError  # type: ignore


class H3CapsuleTest(unittest.TestCase):
    def test_capsule(self):
        capsule1 = H3Capsule(0x12345, b'abcde')
        bs = capsule1.encode()
        decoder = H3CapsuleDecoder()
        decoder.append(bs)
        capsule2 = next(iter(decoder))

        self.assertEqual(bs, b'\x80\x01\x23\x45\x05abcde', 'bytes')
        self.assertEqual(capsule1.type, capsule2.type, 'type')
        self.assertEqual(capsule1.data, capsule2.data, 'data')

    def test_small_capsule(self):
        capsule1 = H3Capsule(0, b'')
        bs = capsule1.encode()
        decoder = H3CapsuleDecoder()
        decoder.append(bs)
        capsule2 = next(iter(decoder))

        self.assertEqual(bs, b'\x00\x00', 'bytes')
        self.assertEqual(capsule1.type, capsule2.type, 'type')
        self.assertEqual(capsule1.data, capsule2.data, 'data')

    def test_capsule_append(self):
        decoder = H3CapsuleDecoder()
        decoder.append(b'\x80')

        with self.assertRaises(StopIteration):
            next(iter(decoder))

        decoder.append(b'\x01\x23')
        with self.assertRaises(StopIteration):
            next(iter(decoder))

        decoder.append(b'\x45\x05abcd')
        with self.assertRaises(StopIteration):
            next(iter(decoder))

        decoder.append(b'e\x00')
        capsule1 = next(iter(decoder))

        self.assertEqual(capsule1.type, 0x12345, 'type')
        self.assertEqual(capsule1.data, b'abcde', 'data')

        with self.assertRaises(StopIteration):
            next(iter(decoder))

        decoder.append(b'\x00')
        capsule2 = next(iter(decoder))
        self.assertEqual(capsule2.type, 0, 'type')
        self.assertEqual(capsule2.data, b'', 'data')

    def test_multiple_values(self):
        decoder = H3CapsuleDecoder()
        decoder.append(b'\x01\x02ab\x03\x04cdef')

        it = iter(decoder)
        capsule1 = next(it)
        capsule2 = next(it)
        with self.assertRaises(StopIteration):
            next(it)
        with self.assertRaises(StopIteration):
            next(iter(decoder))

        self.assertEqual(capsule1.type, 1, 'type')
        self.assertEqual(capsule1.data, b'ab', 'data')
        self.assertEqual(capsule2.type, 3, 'type')
        self.assertEqual(capsule2.data, b'cdef', 'data')

    def test_final(self):
        decoder = H3CapsuleDecoder()
        decoder.append(b'\x01')

        with self.assertRaises(StopIteration):
            next(iter(decoder))

        decoder.append(b'\x01a')
        decoder.final()
        capsule1 = next(iter(decoder))
        with self.assertRaises(StopIteration):
            next(iter(decoder))

        self.assertEqual(capsule1.type, 1, 'type')
        self.assertEqual(capsule1.data, b'a', 'data')

    def test_final_invalid(self):
        decoder = H3CapsuleDecoder()
        decoder.append(b'\x01')

        with self.assertRaises(StopIteration):
            next(iter(decoder))

        decoder.final()
        with self.assertRaises(BufferReadError):
            next(iter(decoder))

if __name__ == '__main__':
    unittest.main()
