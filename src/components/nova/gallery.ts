import g1 from "@/assets/g1.jpg";
import g2 from "@/assets/g2.jpg";
import g3 from "@/assets/g3.jpg";
import g4 from "@/assets/g4.jpg";

export type GalleryItem = { src: string; title: string; prompt: string };

export const GALLERY: GalleryItem[] = [
  {
    src: g1,
    title: "Nebula astronotu",
    prompt:
      "Sinematik portre: neon camgöbeği ve mavi bir nebulanın içinde süzülen astronot, kaskının vizöründe parlayan yansımalar, yıldız tozu parçacıkları, 85mm lens, sığ alan derinliği, hacimsel ışık, ultra detaylı, 8k",
  },
  {
    src: g2,
    title: "Uçurumdaki ev",
    prompt:
      "Mimari fotoğraf: uçurum kenarında minimal Japon esintili modern ev, gün doğumunda turkuaz-yeşil degrade gökyüzü, sıcak iç mekan ışığı, geniş açı, doğal renkler, yüksek dinamik aralık, dergi kapağı kalitesinde",
  },
  {
    src: g3,
    title: "Cam sinekkuşu",
    prompt:
      "Makro stüdyo fotoğrafı: sıvı zümrüt ve safir camdan yapılmış sinekkuşu, tamamen siyah arka plan, kenar ışığı, kristal saydamlık, donmuş kanat hareketi, hiper gerçekçi, ürün fotoğrafı ışığı",
  },
  {
    src: g4,
    title: "Akışkan degrade",
    prompt:
      "Soyut 3D render: parlak krom ve yeşil-camgöbeği degradeli akışkan formlar, yumuşak stüdyo ışığı, ipeksi yüzey, minimal kompozisyon, duvar kağıdı, oktan render, 4k",
  },
];
