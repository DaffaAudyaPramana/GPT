# ChatGPT Conversation Booster

Ekstensi Chrome Manifest V3 untuk meringankan percakapan ChatGPT yang panjang. Ekstensi hanya menampilkan sejumlah pesan terbaru dan menyediakan tombol **Muat pesan sebelumnya** di dalam percakapan.

Semua pemrosesan dilakukan lokal di browser. Tidak ada server, analitik, akun, atau pengiriman isi percakapan.

## Memasang di Chrome

1. Buka `chrome://extensions`.
2. Aktifkan **Developer mode** di kanan atas.
3. Klik **Load unpacked**.
4. Pilih folder ini (`D:\ChatGPT Boost Extension`).
5. Buka atau muat ulang `https://chatgpt.com/`.

Klik ikon ekstensi untuk mengaktifkan/nonaktifkan booster dan mengatur jumlah pesan. Setelah mengubah kode, klik tombol **Reload** pada kartu ekstensi di `chrome://extensions`, kemudian muat ulang tab ChatGPT.

## Cara kerja

- Pesan lama diberi `display: none`, sehingga browser tidak perlu melakukan layout dan paint untuk seluruh percakapan.
- Pesan tidak dihapus dan tidak diubah isinya. Tombol di atas pesan aktif dapat menampilkannya kembali per kelompok.
- Pengaturan disimpan melalui `chrome.storage.sync`.
- Selector DOM dibuat bertingkat sebagai toleransi jika struktur halaman ChatGPT berubah.
- Observer mengabaikan DOM milik ekstensi agar tidak terjadi loop pembaruan.
- Posisi baca dipertahankan saat pesan sebelumnya dimuat pada scroll container ChatGPT.

## Batasan

Ekstensi ini mengurangi beban rendering, tetapi tidak dapat menjamin persentase penghematan RAM tertentu. ChatGPT adalah aplikasi yang terus berubah; jika OpenAI mengganti struktur elemen percakapan secara besar, selector di `content.js` mungkin perlu diperbarui.
