import { parseArgs } from "jsr:@std/cli/parse-args";
import {
  PDFDocument,
  PDFName,
  PDFPage,
  rectanglesAreEqual,
} from "https://cdn.skypack.dev/pdf-lib?dts";

class PageSizeVariation {
  readonly variation: number[];
  readonly max: number;
  readonly min: number;

  constructor(pages: PDFPage[], vertical: boolean) {
    const ns = vertical
      ? pages.map((page) => page.getHeight())
      : pages.map((page) => page.getWidth());
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
const setViewRect = (
  page: PDFPage,
  xDelta: number,
  yDelta: number,
  width: number,
  height: number,
) => {
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

const getCroppedPage = (
  basePage: PDFPage,
  xDelta: number,
  yDelta: number,
  width: number,
  height: number,
): PDFPage => {
  const cloned = clonePDFPage(basePage);
  setViewRect(cloned, xDelta, yDelta, width, height);
  return cloned;
};

const unspread = async (
  path: string,
  vertical: boolean,
  centeredTop: boolean,
  centeredLast: boolean,
  opposite: boolean,
): Promise<number> => {
  const data = await Deno.readFile(path);
  const srcDoc = await PDFDocument.load(data);
  const outDoc = await PDFDocument.create();
  const range = srcDoc.getPageIndices();
  const pages = await outDoc.copyPages(srcDoc, range);
  const lastPageIndex = srcDoc.getPageCount() - 1;

  if (
    pages.some((page) => {
      return page.getRotation().angle == 90;
    })
  ) {
    vertical = !vertical;
  }

  const sizes = new PageSizeVariation(pages, vertical);

  pages.forEach((page: PDFPage, idx: number) => {
    const width = page.getWidth();
    const height = page.getHeight();

    const dimension = vertical ? height : width;
    const otherDim = vertical ? width : height;
    const halfDim = Math.floor(dimension / 2);

    if ((idx == 0 && centeredTop) || (idx == lastPageIndex && centeredLast)) {
      const quadrant = Math.floor(dimension / 4);
      const cloned = getCroppedPage(
        page,
        vertical ? 0 : quadrant,
        vertical ? quadrant : 0,
        vertical ? otherDim : halfDim,
        vertical ? halfDim : otherDim,
      );
      outDoc.addPage(cloned);
      return;
    }

    if (1 < sizes.variation.length && dimension == sizes.min) {
      console.log(`SKIP: page ${idx + 1} is minimal size.`);
      outDoc.addPage(clonePDFPage(page));
      return;
    }

    const ds = vertical ? [halfDim, 0] : [0, halfDim];
    if (opposite) {
      ds.unshift(ds.pop()!);
    }
    ds.forEach((d) => {
      const cloned = getCroppedPage(
        page,
        vertical ? 0 : d,
        vertical ? d : 0,
        vertical ? otherDim : halfDim,
        vertical ? halfDim : otherDim,
      );
      outDoc.addPage(cloned);
    });
  });

  const bytes = await outDoc.save();
  const outPath = withSuffix(path, "_unspread");
  await Deno.writeFile(outPath, bytes);
  return 0;
};

const main = () => {
  const flags = parseArgs(Deno.args, {
    string: ["path"],
    boolean: ["vertical", "centeredTop", "centeredLast", "opposite"],
    default: {
      path: "",
      vertical: false,
      centeredTop: false,
      centeredLast: false,
      opposite: false,
    },
  });
  unspread(
    flags.path,
    flags.vertical,
    flags.centeredTop,
    flags.centeredLast,
    flags.opposite,
  ).then((rc) => {
    Deno.exit(rc);
  });
};

main();
