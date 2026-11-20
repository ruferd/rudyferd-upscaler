const HF_SPACE = 'https:' + '//nightfury-image-face-upscale-restoration-gfpgan-restoref-b1f81c7.hf.space';
const EXP = 604800000;
const $ = id => document.getElementById(id);
let fSel = null;

$('fImg').onchange = e => {
  fSel = e.target.files.item(0);
  if (!fSel) return;
  const r = new FileReader();
  r.onload = v => {
    const img = new Image();
    img.onload = () => {
      $('prev').src = v.target.result;
      $('prev').style.display = 'block';
      $('bDel').style.display = 'inline-block';
      $('infoAsli').innerText = `Ukuran asli: ${img.width} x ${img.height} px`;
    };
    img.src = v.target.result;
  };
  r.readAsDataURL(fSel);
};

$('bDel').onclick = () => {
  fSel = null; $('fImg').value = '';
  $('prev').style.display = 'none';
  $('bDel').style.display = 'none';
  $('infoAsli').innerText = '';
};

function bukaModal(url, info) {
  $('modalImg').src = url;
  $('modalInfo').innerText = info;
  $('modalDl').href = url;
  $('modalDl').download = 'upscale-penuh.jpg';
  $('modal').style.display = 'block';
}
$('modalBtn').onclick = () => { $('modal').style.display = 'none'; };

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('RudyferdUpscaleDB', 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e);
  });
}

async function loadH() {
  const db = await openDB(), tx = db.transaction('fotos', 'readwrite'), st = tx.objectStore('fotos'), now = Date.now();
  const all = await new Promise(r => { const q = st.getAll(); q.onsuccess = () => r(q.result || []); });
  all.sort((a, b) => b.t - a.t);
  const ok = [];
  for (const x of all) {
    if (now - x.t >= EXP || ok.length >= 10) st.delete(x.id);
    else ok.push(x);
  }
  $('riwayat').innerHTML = '';
  if (!ok.length) { $('riwayat').innerHTML = '<div style="grid-column:1/-1;color:#888">Belum ada riwayat foto.</div>'; return; }
  ok.forEach(x => {
    const u = URL.createObjectURL(x.b);
    const hr = Math.ceil((EXP - (now - x.t)) / 86400000);
    const info = `${x.w}x${x.h} px (${x.mp} MP • ${x.mode})`;
    const div = document.createElement('div');
    div.className = 'item-rw';
    div.innerHTML = `<img src="${u}"><span>${x.mp} MP • Hapus ${hr} hr</span><a class="btn-dl-sm" href="${u}" download="rf-up-${x.mp}MP-${x.id}.jpg">Download (${x.mp} MP)</a>`;
    div.querySelector('img').onclick = () => bukaModal(u, info);
    $('riwayat').appendChild(div);
  });
}

async function saveH(b, w, h, mp, mode) {
  const db = await openDB(), tx = db.transaction('fotos', 'readwrite');
  tx.objectStore('fotos').add({ b, w, h, mp, mode, t: Date.now() });
  tx.oncomplete = () => loadH();
}

function sesuaikanSkalaAkhir(urlGambar, skalaTarget, skalaServer) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const faktor = skalaTarget / skalaServer;
      const w = Math.round(img.width * faktor);
      const h = Math.round(img.height * faktor);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        const mp = ((w * h) / 1e6).toFixed(1);
        resolve({ url: URL.createObjectURL(blob), b: blob, w, h, mp });
      }, 'image/jpeg', 0.95);
    };
    img.onerror = () => reject(new Error('Gagal memproses hasil akhir.'));
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
  $('stat').innerText = 'Mengunggah foto asli ke server Real-ESRGAN + GFPGAN...';

  try {
    const fd = new FormData();
    fd.append('files', fSel);
    const upRes = await fetch(HF_SPACE + '/upload', { method: 'POST', body: fd });
    if (!upRes.ok) throw new Error('Server sedang tidur atau sibuk. Coba tekan tombol sekali lagi dalam 20 detik.');
    const paths = await upRes.json();
    const filePath = Array.isArray(paths) ? paths.shift() : paths;

    $('stat').innerText = 'Menjalankan AI GFPGAN & Real-ESRGAN (20-50 detik)...';
    const callRes = await fetch(HF_SPACE + '/call/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          { path: filePath, meta: { _type: 'gradio.FileData' } },
          mode,
          skalaServer,
          0.5
        ]
      })
    });
    const callData = await callRes.json();
    if (!callData.event_id) throw new Error('Antrean server penuh, coba lagi sebentar.');

    const streamRes = await fetch(HF_SPACE + '/call/predict/' + callData.event_id);
    const streamText = await streamRes.text();
    const lines = streamText.split('\n');
    let rawUrl = null;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (Array.isArray(parsed) && parsed.length > 0) {
            const item = parsed.shift();
            rawUrl = typeof item === 'string' ? item : (item.url || (item.path ? HF_SPACE + '/file=' + item.path : null));
          }
        } catch (e) {}
      }
    }

    if (!rawUrl) throw new Error('Server tidak mengembalikan gambar (sedang bangun dari mode tidur, silakan tekan ulang).');

    $('stat').innerText = 'Menyiapkan resolusi akhir...';
    const hd = await sesuaikanSkalaAkhir(rawUrl, skalaTarget, skalaServer);
    const infoTeks = `${hd.w} x ${hd.h} px (~${hd.mp} MP • ${mode} + Real-ESRGAN)`;

    $('hasil').innerHTML =
      `<img id="imgHasilUtama" src="${hd.url}" alt="Hasil Upscale">` +
      `<div style="font-size:12px;color:#aaa;margin-top:6px">${infoTeks}</div>` +
      `<a class="btn-dl" href="${hd.url}" download="upscale-${mode}-${hd.mp}MP.jpg">Simpan Foto Tajam (${hd.mp} MP)</a>`;
    $('imgHasilUtama').onclick = () => bukaModal(hd.url, infoTeks);

    await saveH(hd.b, hd.w, hd.h, hd.mp, mode);
    $('stat').innerText = 'Selesai! Klik gambar untuk melihat ukuran penuh.';
  } catch (err) {
    $('stat').innerText = 'Gagal: ' + err.message;
  } finally {
    $('bRun').disabled = false;
  }
};

loadH();
