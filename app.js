import { Client } from "https://jsdelivr.net";

const $ = id => document.getElementById(id);
let fSel = null;

$('fImg').onchange = e => {
  fSel = e.target.files.item(0);
  if (!fSel) return;
  const r = new FileReader();
  r.onload = v => {
    $('prev').src = v.target.result;
    $('prev').style.display = 'block';
  };
  r.readAsDataURL(fSel);
};

function sesuaikanSkalaAkhir(urlGambar, skalaTarget, skalaServer) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const faktor = skalaTarget / skalaServer;
      const w = Math.round(img.width * faktor);
      const h = Math.round(img.height * faktor);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        const mp = ((w * h) / 1e6).toFixed(1);
        resolve({ url: URL.createObjectURL(blob), w, h, mp });
      }, 'image/jpeg', 0.95);
    };
    img.onerror = () => reject(new Error('Gagal memproses hasil akhir dari server.'));
    img.src = urlGambar;
  });
}

$('bRun').onclick = async () => {
  if (!fSel) return alert('Pilih foto yang ingin di-upscale terlebih dahulu!');
  const mode = $('modeFace').value;
  const skalaTarget = parseInt($('skala').value);
  const skalaServer = skalaTarget >= 4 ? 4 : 2;

  $('bRun').disabled = true;
  $('hasil').innerHTML = '';
  $('stat').innerText = 'Menghubungkan ke server Real-ESRGAN + GFPGAN...';

  try {
    const app = await Client.connect("nightfury/Image_Face_Upscale_Restoration-GFPGAN-RestoreFormer-CodeFormer-RealESRGAN");
    $('stat').innerText = 'Memproses wajah & mempertajam gambar (sekitar 15-40 detik)...';

    const result = await app.predict("/predict", [
      fSel,
      mode,
      skalaServer,
      0.5
    ]);

    const outputData = result.data && result.data.length ? result.data.shift() : null;
    const rawUrl = typeof outputData === 'string' ? outputData : (outputData && outputData.url ? outputData.url : null);

    if (!rawUrl) throw new Error('Server tidak mengembalikan gambar.');

    $('stat').innerText = 'Menyiapkan file resolusi akhir...';
    const hd = await sesuaikanSkalaAkhir(rawUrl, skalaTarget, skalaServer);

    $('hasil').innerHTML =
      `<img src="${hd.url}" alt="Hasil Upscale">` +
      `<div style="font-size:12px;color:#aaa;margin-top:6px">${hd.w} x ${hd.h} px (~${hd.mp} MP • ${mode} + Real-ESRGAN)</div>` +
      `<a class="btn-dl" href="${hd.url}" download="upscale-${mode}-${hd.mp}MP.jpg">Simpan Foto Tajam (${hd.mp} MP)</a>`;

    $('stat').innerText = 'Selesai! Wajah & latar belakang berhasil dipertajam.';
  } catch (err) {
    $('stat').innerText = 'Gagal: ' + (err.message || 'Server sedang penuh/tidur, coba tekan ulang dalam 30 detik.');
  } finally {
    $('bRun').disabled = false;
  }
};

