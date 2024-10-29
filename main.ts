import { parseArgs } from "jsr:@std/cli/parse-args";
import { PDFDocument, PDFPage, PDFName, rectanglesAreEqual } from "https://cdn.skypack.dev/pdf-lib?dts";

class PageSizeVariation {
  readonly variation: number[];
  readonly max: number;
  readonly min: number;

  constructor(pages: PDFPage[], vertical: boolean) {
    const ns = vertical ? pages.map((page) => page.getHeight()) : pages.map((page) => page.getWidth());
    this.variation = ns.reduce((acc: number[], w: number): number[] => {
      if (!acc.includes(w)) {
        acc.push(w);
      }
      return acc;
    }, []);
    this.max = Math.max(...this.variation);
    this.min = Math.min(...this.variation);
  }
}

const withSuffix = (path: string, suffix: string): string => {
  const parts = path.split(".");
  const extension = parts.pop() || "";
  return parts.join(".") + suffix + "." + extension;
};

// https://github.com/Hopding/pdf-lib/issues/47#issuecomment-569315318
const clonePDFPage = (org: PDFPage): PDFPage => {
  const cloneNode = org.node.clone();

  const { Contents } = org.node.normalizedEntries();
  if (Contents) {
    cloneNode.set(PDFName.of("Contents"), Contents.clone());
  }

  const cloneRef = org.doc.context.register(cloneNode);
  const clonePage = PDFPage.of(cloneNode, cloneRef, org.doc);
  return clonePage;
};

// https://github.com/Hopding/pdf-lib/blob/93dd36e85aa659a3bca09867d2d8fac172501fbe/src/api/PDFPage.ts#L191
const setViewRect = (page: PDFPage, xDelta: number, yDelta: number, width: number, height: number) => {
  const mbox = page.getMediaBox();
  const xpos = mbox.x + xDelta;
  const ypos = mbox.y + yDelta;
  page.setMediaBox(xpos, ypos, width, height);

  const cropBox = page.getCropBox();
  const bleedBox = page.getBleedBox();
  const trimBox = page.getTrimBox();
  const artBox = page.getArtBox();

  const hasCropBox: boolean = !!page.node.CropBox();
  const hasBleedBox: boolean = !!page.node.BleedBox();
  const hasTrimBox: boolean = !!page.node.TrimBox();
  const hasArtBox: boolean = !!page.node.ArtBox();

  if (hasCropBox && rectanglesAreEqual(cropBox, mbox)) {
    page.setCropBox(xpos, ypos, width, height);
  }
  if (hasBleedBox && rectanglesAreEqual(bleedBox, mbox)) {
    page.setBleedBox(xpos, ypos, width, height);
  }
  if (hasTrimBox && rectanglesAreEqual(trimBox, mbox)) {
    page.setTrimBox(xpos, ypos, width, height);
  }
  if (hasArtBox && rectanglesAreEqual(artBox, mbox)) {
    page.setArtBox(xpos, ypos, width, height);
  }
};

const getCropedPage = (basePage: PDFPage, xDelta: number, yDelta: number, width: number, height: number): PDFPage => {
  const cloned = clonePDFPage(basePage);
  setViewRect(cloned, xDelta, yDelta, width, height);
  return cloned;
};

const unspread = async (path: string, vertical: boolean, centeredTop: boolean, centeredLast: boolean, invert: boolean): Promise<number> => {
  const data = await Deno.readFile(path);
  const srcDoc = await PDFDocument.load(data);
  const outDoc = await PDFDocument.create();
  const range = srcDoc.getPageIndices();
  const pages = await outDoc.copyPages(srcDoc, range);
  const lastPageIndex = srcDoc.getPageCount() - 1;

  const sizes = new PageSizeVariation(pages, vertical);

  pages.forEach((page: PDFPage, idx: number) => {
    const width = page.getWidth();
    const height = page.getHeight();
    const halfWidth = Math.floor(width / 2);
    const halfHeight = Math.floor(height / 2);

    if (vertical) {
      if ((idx == 0 && centeredTop) || (idx == lastPageIndex && centeredLast)) {
        const cloned = getCropedPage(page, 0, Math.floor(height / 4), width, halfHeight);
        outDoc.addPage(cloned);
        return;
      }

      if (page.getHeight() == sizes.min) {
        console.log(`SKIP: page ${idx + 1} is minimal size.`);
        outDoc.addPage(clonePDFPage(page));
        return;
      }

      const ys = [halfHeight, 0];
      if (invert) {
        ys.unshift(ys.pop()!);
      }
      ys.forEach((y) => {
        const cloned = getCropedPage(page, 0, y, width, halfHeight);
        outDoc.addPage(cloned);
      });
    } else {
      if ((idx == 0 && centeredTop) || (idx == lastPageIndex && centeredLast)) {
        const cloned = getCropedPage(page, Math.floor(width / 4), 0, halfWidth, height);
        outDoc.addPage(cloned);
        return;
      }

      if (page.getWidth() == sizes.min) {
        console.log(`SKIP: page ${idx + 1} is minimal size.`);
        outDoc.addPage(clonePDFPage(page));
        return;
      }

      const xs = [0, halfWidth];
      if (invert) {
        xs.unshift(xs.pop()!);
      }
      xs.forEach((x) => {
        const cloned = getCropedPage(page, x, 0, halfWidth, height);
        outDoc.addPage(cloned);
      });
    }
  });

  const bytes = await outDoc.save();
  const outPath = withSuffix(path, "_unspread");
  await Deno.writeFile(outPath, bytes);
  return 0;
};

const main = () => {
  const flags = parseArgs(Deno.args, {
    string: ["path"],
    boolean: ["vertical", "centeredTop", "centeredLast", "invert"],
    default: {
      path: "",
      vertical: false,
      centeredTop: false,
      centeredLast: false,
      invert: false,
    },
  });
  unspread(flags.path, flags.vertical, flags.centeredTop, flags.centeredLast, flags.invert).then((rc) => {
    Deno.exit(rc);
  });
};

main();
