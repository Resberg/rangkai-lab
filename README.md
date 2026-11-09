# Rangkai Lab

Rangkai Lab adalah simulator DC dan AC berbahasa Indonesia. Gambar skema di kanvas, cari nilai komponen dari data soal, lalu lihat langkah perhitungannya.

## Coba di komputer

Buka `index.html` di browser. Aplikasi memakai HTML, CSS, dan JavaScript biasa sehingga bisa berjalan tanpa instalasi, server, atau build.

1. Pilih **Kanvas kosong** atau mulai dari contoh seri, paralel, atau sumber arus.
2. Pilih alat, lalu klik dua titik pada grid. Untuk kabel, kamu juga bisa menyeret mouse. Pada layar sentuh, ketuk dua titik.
3. Sambungkan terminal pada titik grid yang sama. Kabel yang bersilangan tersambung jika ada terminal atau ujung kabel pada persilangan.
4. Gunakan **Pilih** untuk mengubah nilai komponen. Saat komponen dan kabel ditambah, dihapus, atau nilai diterapkan, simulator langsung memperbarui tegangan dan arus pada tiap label skema. Buka hasil tiap komponen untuk melihat rumusnya.

Contoh seri menggunakan sumber 6 V, R1 = 100 Ω, dan R2 = 200 Ω. Hambatan totalnya 300 Ω, sehingga arusnya 6 V ÷ 300 Ω = 20 mA. Tegangan R1 adalah 0,02 A × 100 Ω = 2 V.

Kalkulator Hukum Ohm di bawah kanvas mencari V, I, atau R dari dua nilai yang diketahui. Di kanvas, nilai setiap resistor dimasukkan sebelum simulasi.

## Cari nilai yang belum diketahui

Simulasi biasa memakai nilai yang tampil pada komponen, termasuk nilai awal saat komponen baru dipasang. Gunakan mode soal jika ingin mencari parameter yang ditandai `?`. Tombol **Pakai nilai simulasi** memakai kembali nilai yang tersimpan dan menjalankan simulasi langsung.

1. Pilih komponen pada skema, centang **Cari nilai komponen ini**, lalu klik **Tandai sebagai ?**.
2. Di **Data soal**, pilih cabang tempat tegangan atau arus diketahui. Data boleh berasal dari cabang yang berbeda dengan komponen yang dicari.
3. Masukkan nilai sesuai arah A ke B. A adalah terminal yang digambar pertama. Pada AC, masukkan magnitudo RMS dan fase terhadap acuan yang sama dengan sumber.
4. Klik **Hitung**. Panel hasil menunjukkan nilai, rumus, dan langkah untuk mendapatkan tegangan dan arus cabangnya. **Pakai nilai hasil** memasukkan nilai tersebut ke skema.

Pada contoh **Soal DC · cari nilai R2**, sumber 6 V dan R1 = 100 Ω tersusun seri dengan R2. Data V(R1) = 2 V memberi I = 0,02 A. R2 mendapat sisa tegangan 4 V sehingga R2 = 4 V ÷ 0,02 A = 200 Ω.

Jika beberapa komponen bertanda `?`, pilih satu pada **Hitung komponen mana dulu?**. Isi data ukur untuk komponen itu. Klik **+ Tambah data ukur** jika perlu memasukkan petunjuk tambahan. Data disimpan terpisah untuk tiap komponen. **Pakai nilai hasil** menerapkan hasil untuk komponen terpilih, lalu kamu bisa melanjutkan ke komponen lain.

Contoh **Soal DC · cari R1 dan R2** memakai sumber 6 V, arus R1 sebesar 20 mA, dan tegangan R1 sebesar 2 V. Maka R1 = 2 V ÷ 0,02 A = 100 Ω dan R2 = (6 V − 2 V) ÷ 0,02 A = 200 Ω.

Solver hanya meminta informasi yang diperlukan untuk target terpilih. Komponen lain tetap bebas jika nilainya belum diketahui. Sumber tegangan memerlukan beda tegangan yang dapat ditentukan, sedangkan resistor memerlukan beda tegangan dan arus cabang yang dapat ditentukan. Dua pengukuran arus pada rangkaian seri dapat memberi informasi yang sama. Kapasitansi dan induktansi memerlukan data AC karena besar C dan L tidak memengaruhi model DC tunak. Masukkan semua data AC pada frekuensi dan acuan fase yang sama.

Jika kedua terminal sumber tersambung melalui kabel ideal, keduanya berada pada simpul yang sama. Sumber bertanda `?` langsung menghasilkan 0 V. Untuk sumber yang ditetapkan nonnol, panel menunjukkan pertentangan antara tegangan sumber dan 0 V pada kabel. Pada 0 V, arus di cabang sumber yang sejajar dengan kabel tidak unik.

## Ukur dua titik pada skema

1. Pilih **Ukur A–B**, lalu klik titik A dan B pada ujung komponen atau titik grid di sepanjang kabel. Probe tidak membuat sambungan listrik baru.
   Panah kuning mengikuti salah satu jalur terpendek pada skema dari A ke B sebagai acuan pengukuran. Arus sebenarnya mengikuti hasil simulasi tiap cabang dan dapat terbagi jika ada beberapa jalur.
2. Panel hasil memberi beda tegangan V(A) − V(B) dan hambatan ekuivalen Thévenin pada DC atau impedansi ekuivalen pada AC. Nilai ekuivalen dihitung dengan menonaktifkan sumber independen dan memasukkan arus uji 1 A. Komponen yang masih tergambar ikut dihitung, termasuk beban yang masih terpasang.
3. Untuk soal dengan komponen bertanda `?`, pilih **Titik ukur A–B** pada **Lokasi ukur** dan masukkan tegangan yang diketahui. Pada AC, masukkan magnitudo RMS dan fase.

Contoh seri menampilkan V(A) − V(B) = 2 V jika titik A dan B berada di sisi kiri dan kanan R1. Hambatan ekuivalen antara kedua titik adalah sekitar 66,67 Ω karena R1 dan R2 menyediakan dua jalur paralel setelah sumber 6 V dinonaktifkan.

## Pratinjau LaTeX

Tempel satu ekspresi di panel **LaTeX langsung tampil**. Pembatas `$…$`, `$$…$$`, `\(…\)`, dan `\[…\]` opsional. KaTeX merender pratinjau saat kamu mengetik, termasuk pecahan, indeks, dan simbol. Kolom data soal memakai nilai numerik.

KaTeX 0.19.1 disertakan di `vendor/katex` dengan lisensi upstream agar pratinjau berfungsi secara lokal. [Dokumentasi KaTeX](https://katex.org/docs/api)

## Analisis AC dan ekspor

- Komponen yang tersedia mencakup resistor (Ω), kapasitor (F), induktor (H), sumber tegangan dan arus independen, kabel, serta amperemeter ideal. Masukkan nilai dalam satuan SI. Sebagai contoh, 1 µF dimasukkan sebagai `0.000001` F.
- **DC tunak** memodelkan kapasitor sebagai cabang terbuka dan induktor sebagai jalur dengan beda tegangan nol. Bila terminal kapasitor berada pada dua bagian mengambang dengan acuan terpisah, beda tegangannya ditandai tak terdefinisi.
- **AC fasor** menggunakan sumber sinusoidal pada satu frekuensi. Atur amplitudo RMS dan fase sumber. Hasil memberi tegangan simpul, tegangan dan arus cabang, serta rumus impedansi.
- **Eksportir sweep AC** menghitung 2–301 titik berjarak logaritmik. CSV berisi frekuensi (Hz), nilai komponen dalam SI, bagian real dan imajiner fasor RMS, magnitudo RMS, fase (°), dan pesan galat jika sebuah titik tidak bisa diselesaikan.
- Amperemeter ideal harus dipasang seri. Loop komponen ideal berimpedansi nol dapat membuat arus cabang tidak unik.

Solver menggunakan analisis simpul termodifikasi. Cakupannya adalah rangkaian linier ideal pada DC tunak dan AC sinusoidal. Untuk penggunaan riset, validasi hasil terhadap hitungan analitik atau simulator pembanding seperti ngspice. Model saat ini tidak mencakup transien, semikonduktor nonlinier, parasitik, atau estimasi dari data pengukuran bising.

Skema dibuat langsung di kanvas. Perubahan bertahan selama tab masih terbuka.

## Uji solver

Jalankan `node --test test/solver.test.js` dari folder proyek. Uji memeriksa kasus DC dan AC terhadap rumus analitik serta penanganan data yang tidak cukup.

## Publikasikan di GitHub Pages

1. Buat repositori GitHub, misalnya `rangkai-lab`.
2. Unggah isi folder ini ke branch `main`. Pastikan `index.html` ada di tingkat teratas repositori.
3. Buka **Settings → Pages**. Pilih **Deploy from a branch**, lalu **main → /(root) → Save**.
4. Setelah deployment selesai, buka **Visit site** dari pengaturan Pages.

[Panduan resmi GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
