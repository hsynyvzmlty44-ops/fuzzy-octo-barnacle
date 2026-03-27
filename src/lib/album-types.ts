export type AlbumPageData = {
  /** YYYY-MM-DD veya boş */
  date: string;
  quote: string;
  /** base64 data URL veya null */
  image: string | null;
  /** Fotoğraf kutusunun sayfa üzerinde dönüşü (derece) */
  imageRotation?: number;
  /** Kutu boyutu çarpanı (1 = varsayılan genişlik) */
  imageScale?: number;
  /** Kutu merkezinin yatay kayması: tuval genişliğine göre % (merkez 0) */
  imagePanX?: number;
  /** Kutu merkezinin dikey kayması: tuval yüksekliğine göre % (merkez 0) */
  imagePanY?: number;
};

/** Yeni yükleme ve silme sonrası: ortada, ek düzenleme gerektirmeyen başlangıç */
export const DEFAULT_IMAGE_FRAME = {
  imageRotation: 0,
  imageScale: 1,
  imagePanX: 0,
  imagePanY: 0,
} as const;

export const ALBUM_PAGE_COUNT = 100;
