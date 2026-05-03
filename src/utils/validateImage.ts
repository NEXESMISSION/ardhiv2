// Magic-byte image validator. Browsers report `file.type` based on the
// extension, so an attacker can rename `evil.svg` (containing `<script>`) to
// `.png` and the MIME prefix check passes. Real image formats start with a
// known signature; checking it stops that vector.
//
// Supports PNG, JPEG, GIF, and WebP. Returns true if the first bytes match
// one of those signatures.
export async function isRealImageFile(file: File): Promise<boolean> {
  if (!file || file.size === 0) return false

  const buf = await file.slice(0, 12).arrayBuffer()
  const b = new Uint8Array(buf)

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) {
    return true
  }
  // JPEG (any flavor): FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
    return true
  }
  // GIF87a / GIF89a: "GIF8" then "7a" or "9a"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return true
  }
  // WebP: RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return true
  }
  return false
}
