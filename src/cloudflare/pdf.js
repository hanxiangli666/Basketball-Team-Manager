const encoder = new TextEncoder()

function normalizePdfText(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?")
}

function escapePdfString(value) {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}

function wrapLine(line, maxChars) {
  const words = line.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ""

  for (const word of words) {
    if (!current) {
      current = word
      continue
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) {
    lines.push(current)
  }

  return lines.length ? lines : [""]
}

function paginateText(text, { maxChars = 88, maxLines = 44 } = {}) {
  const wrappedLines = normalizePdfText(text)
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line, maxChars))

  const pages = []
  for (let index = 0; index < wrappedLines.length; index += maxLines) {
    pages.push(wrappedLines.slice(index, index + maxLines))
  }

  return pages.length ? pages : [[""]]
}

function createPageStream(lines, pageNumber, pageCount) {
  const body = [
    "BT",
    "/F1 18 Tf",
    "72 750 Td",
    "(Drew MBB Practice Report) Tj",
    "/F1 10 Tf",
    "0 -24 Td",
    `(${escapePdfString(new Date().toISOString().slice(0, 10))}) Tj`,
    "/F1 11 Tf",
    "0 -28 Td",
    ...lines.flatMap((line) => [
      `(${escapePdfString(line)}) Tj`,
      "0 -15 Td",
    ]),
    "/F1 9 Tf",
    "0 -18 Td",
    `(Page ${pageNumber} of ${pageCount}) Tj`,
    "ET",
  ]

  return body.join("\n")
}

function objectEntry(id, value) {
  return `${id} 0 obj\n${value}\nendobj\n`
}

export function createTextPdf(text) {
  const pages = paginateText(text)
  const fontObjectId = 3 + pages.length * 2
  const objects = [
    objectEntry(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    objectEntry(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`),
  ]

  pages.forEach((lines, index) => {
    const pageObjectId = 3 + index * 2
    const streamObjectId = pageObjectId + 1
    const stream = createPageStream(lines, index + 1, pages.length)
    const streamBytes = encoder.encode(stream)

    objects.push(
      objectEntry(
        pageObjectId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${streamObjectId} 0 R >>`,
      ),
      objectEntry(
        streamObjectId,
        `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`,
      ),
    )
  })

  objects.push(objectEntry(fontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))

  let pdf = "%PDF-1.4\n"
  const offsets = [0]

  for (const object of objects) {
    offsets.push(encoder.encode(pdf).length)
    pdf += object
  }

  const xrefOffset = encoder.encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += "0000000000 65535 f \n"
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  pdf += `startxref\n${xrefOffset}\n%%EOF`

  return encoder.encode(pdf)
}
