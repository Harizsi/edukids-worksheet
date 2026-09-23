/*
   Katalog produk + harga bundle.
   INI MESTI SAMA dengan `products` dan `calculatePrice()` dalam index.html,
   supaya harga yang dikira server sentiasa padan dengan apa yang customer nampak.

   PENTING: gantikan fileUrl di bawah dengan link muat turun SEBENAR
   (Google Drive "Anyone with the link", Dropbox, dsb) sebelum deploy live.
*/

const PRODUCTS = {
    autisme: {
        name: "Set Anak Autisme",
        price: 15,
        fileUrl: "https://drive.google.com/drive/folders/1ArDB7zvoz-xcVlmR2f2mT_lpbAkzCHAn?usp=drive_link"
    },
    membaca: {
        name: "Set Anak Cepat Kenal Huruf & Membaca",
        price: 15,
        fileUrl: "https://drive.google.com/drive/folders/1zSZ2qJl2xvQjoDFU9Akh3UDt2SLVprbm?usp=drive_link"
    },
    motor: {
        name: "Set Latihan Motor Skill & Focus",
        price: 15,
        fileUrl: "https://drive.google.com/drive/folders/18vJ2uQZiBKsw64THxFnAfDFhSRdVSFjK?usp=drive_link"
    },
    tahun1: {
        name: "Set Latihan Tahap 1",
        price: 15,
        fileUrl: "https://drive.google.com/drive/folders/1JWKRImNhttvO-KHsp7UG_4HZwHj_K_k3?usp=drive_link"
    }
};

// Sama macam calculatePrice() dalam index.html
function calculatePrice(count) {
    if (count === 0) return 0;
    if (count === 1) return 15;
    if (count === 2) return 25;
    if (count === 3) return 35;
    if (count === 4) return 45;
    return 45;
}

module.exports = { PRODUCTS, calculatePrice };
