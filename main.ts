import { parseArgs } from "jsr:@std/cli/parse-args";
import { PDFDocument, PDFPage } from "https://cdn.skypack.dev/pdf-lib?dts";

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
  const extension = parts.pop() || "pdf";
  return parts.join(".") + suffix + "." + extension;
};

const embedCroppedPage = async (
  outDoc: PDFDocument,
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const added = outDoc.addPage([width, height]);
  added.setRotation(page.getRotation());
  const mbox = page.getMediaBox();
  const embedded = await outDoc.embedPage(page, {
    left: mbox.x + x,
    bottom: mbox.y + y,
    right: mbox.x + x + width,
    top: mbox.y + y + height,
  });
  added.drawPage(embedded);
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

  const rotated = pages.some((page) => {
    const a = page.getRotation().angle;
    return a == 90 || a == 270 || a == -90;
  });
  if (rotated) {
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
      const q = Math.floor(dimension / 4);
      embedCroppedPage(
        outDoc,
        page,
        vertical ? 0 : q,
        vertical ? q : 0,
        vertical ? otherDim : halfDim,
        vertical ? halfDim : otherDim,
      );
      return;
    }

    if (1 < sizes.variation.length && dimension == sizes.min) {
      console.log(`SKIP: page ${idx + 1} is minimal size.`);
      outDoc.addPage(page);
      return;
    }

    const ds = opposite ? [halfDim, 0] : [0, halfDim];
    if (vertical && !rotated) {
      ds.unshift(ds.pop()!);
    }
    ds.forEach((d) => {
      embedCroppedPage(
        outDoc,
        page,
        vertical ? 0 : d,
        vertical ? d : 0,
        vertical ? otherDim : halfDim,
        vertical ? halfDim : otherDim,
      );
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
