export interface PrintConfig {
  copies: number;
  duplex: "off" | "long-edge" | "short-edge";
  pages: string; // "all" or range like "1-5"
  paperSize: "a4" | "letter";
  orientation: "portrait" | "landscape";
}

export interface UserSession {
  filePath: string;
  fileName: string;
  pageCount: number;
  config: PrintConfig;
}

export const defaultConfig: PrintConfig = {
  copies: 1,
  duplex: "off",
  pages: "all",
  paperSize: "a4",
  orientation: "portrait",
};
