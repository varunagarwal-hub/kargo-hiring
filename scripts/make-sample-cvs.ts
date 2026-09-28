// Generates three fictional sample CVs (2 PDF, 1 DOCX) for the test run.
// All people, numbers and contact details are invented.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { Document, Packer, Paragraph, TextRun } from 'docx'

const OUT = path.resolve(import.meta.dirname, '../test-run/cvs')

export const SAMPLES: { file: string; role: 'pm' | 'spm'; lines: string[] }[] = [
  {
    file: 'priya-nair-pm.pdf',
    role: 'pm',
    lines: [
      'PRIYA NAIR',
      'Product Manager | Navi Mumbai',
      'priya.nair.ops@gmail.com | +91 99301 44821 | linkedin.com/in/priya-nair-logistics',
      '',
      'SUMMARY',
      'Priya is an operations-turned-product person with 7 years in freight forwarding and customs brokerage.',
      '',
      'EXPERIENCE',
      'Senior Operations Executive -> Associate Product Manager, BlueWake Freight Pvt Ltd (2019-2025)',
      '- When a customs hold was placed on a pharma client\'s export consignment at JNPT at 8pm, coordinated directly with the CHA and',
      '  the Appraising Officer through the night; the hold was cleared at 5am and the shipment made its vessel cut-off before the client knew.',
      '- Built a quarterly carrier scorecard for the first time at the branch; used it to renegotiate rates with 3 underperforming',
      '  shipping lines (average 9% reduction) and to move two lanes to a more reliable carrier.',
      '- Ran the onboarding of a new automotive client over 10 weeks, coordinating with the client\'s procurement, plant logistics and',
      '  finance teams as their single point of contact until the first 40 containers moved on schedule.',
      '- During the 2023 peak-season volume spike (documentation up 60% for 5 months), redesigned the document checklist and shift',
      '  handovers; no additional headcount was added and the new checklist was adopted permanently by the branch.',
      '- Wrote the PRD for the shipment-tracking dashboard used by 120 clients; worked with engineering to ship it in two releases.',
      '',
      'EDUCATION',
      'MBA (Operations), NMIMS Mumbai, 2019. B.Com, University of Mumbai, 2016.',
      '',
      'SKILLS',
      'Customs documentation (ICEGATE), carrier management, SQL, Jira, stakeholder management',
    ],
  },
  {
    file: 'karan-mehta-spm.docx',
    role: 'spm',
    lines: [
      'Karan Mehta',
      'Senior Product Manager',
      'karan.mehta@outlook.com  |  +91-98451-77310  |  github.com/karanmehta  |  Koramangala, Bengaluru 560034',
      '',
      'PROFILE',
      'Product leader with 8 years building B2B SaaS. Karan is known for crisp roadmaps and strong execution.',
      '',
      'EXPERIENCE',
      'Senior Product Manager, LedgerLoop (B2B invoicing SaaS), 2021-2025',
      '- Led the roadmap for the invoicing suite; took full ownership of 6 features from spec to release.',
      '- Ran 50+ user interviews across 9 enterprise accounts to shape the approvals workflow.',
      '- Managed competing stakeholder priorities across customer success, sales and engineering.',
      '- Managed QA handoff, release communication and post-launch tracking for the v3 launch.',
      '- Grew the product team by hiring and onboarding 3 PMs and a designer.',
      'Product Manager, CartNest (e-commerce), 2017-2021',
      '- Redesigned checkout, improving conversion by 11%.',
      '- Owned external agency management for the mobile app redesign.',
      '- Patched and deployed a coupon bug fix within 24 hours; average P1 time-to-resolve 30 minutes.',
      '',
      'EDUCATION',
      'B.Tech, Computer Science, VIT Vellore, 2016',
    ],
  },
  {
    file: 'farah-sheikh-pm.pdf',
    role: 'pm',
    lines: [
      'Farah Sheikh',
      'farah.sheikh91@yahoo.in  |  +91 90040 55219  |  https://farahsheikh.in',
      'Andheri East, Mumbai 400069',
      '',
      'ABOUT',
      'Product manager with a logistics operations background. Portfolio: farahsheikh.in/work',
      '',
      'EXPERIENCE',
      'Product Manager, PortPulse Technologies (2022-2025)',
      '- Coordinated daily with shipping lines, CFS operators and port authorities on container status data feeds.',
      '- Led onboarding for new freight-forwarder accounts on the tracking platform.',
      '- When our main AIS data vendor had a 2-day outage, switched ETA feeds to a backup provider; no client ETAs were missed.',
      'Operations Analyst, Transocean Cargo (2019-2022)',
      '- Negotiated with a regional trucking association to settle a 3-month detention dispute; client recovered INR 6 lakh.',
      '- Built weekly MIS reports for the branch head.',
      '',
      'EDUCATION',
      'BMS, Mithibai College, Mumbai, 2019',
    ],
  },
]

async function pdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595, 842])
  let y = 800
  const size = 9.5
  const wrap = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    for (const w of line.split(' ')) {
      const next = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(next, size) > 505 && cur) {
        out.push(cur)
        cur = `  ${w}`
      } else cur = next
    }
    out.push(cur)
    return out
  }
  lines.forEach((line, i) => {
    const isHead = i === 0 || /^[A-Z ]{4,}$/.test(line)
    for (const part of i === 0 ? [line] : wrap(line)) {
      if (y < 50) {
        page = doc.addPage([595, 842])
        y = 800
      }
      page.drawText(part, { x: 45, y, size: i === 0 ? 16 : size, font: isHead ? bold : font })
      y -= i === 0 ? 22 : 14
    }
  })
  return doc.save()
}

async function docx(lines: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: lines.map((l, i) => new Paragraph({ children: [new TextRun({ text: l, bold: i === 0, size: i === 0 ? 32 : 20 })] })) }],
  })
  return Packer.toBuffer(doc)
}

export async function makeSamples() {
  mkdirSync(OUT, { recursive: true })
  for (const s of SAMPLES) {
    const bytes = s.file.endsWith('.pdf') ? await pdf(s.lines) : await docx(s.lines)
    writeFileSync(path.join(OUT, s.file), bytes)
  }
  return SAMPLES.map((s) => ({ ...s, path: path.join(OUT, s.file) }))
}

if (process.argv[1]?.endsWith('make-sample-cvs.ts')) {
  makeSamples().then((r) => console.log(r.map((x) => x.path).join('\n')))
}
