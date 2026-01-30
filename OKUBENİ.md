# Gallery Browser 🎬

![Preview](preview.png)

Gallery Browser, yerel medya koleksiyonunuzu (resim ve video) Netflix tarzı modern bir arayüzle taramanıza, izlemenize ve yönetmenize olanak tanıyan hızlı ve şık bir medya galerisi uygulamasıdır.

---

## 🚀 Özellikler

- **Netflix Tarzı Deneyim:** Modern, hızlı ve kullanıcı dostu arayüz.
- **Akıllı Medya Oynatıcı:** 
  - Mouse tekerleği ile zoom.
  - **Sağ tık ile sürükleyerek kaydırma (Pan).**
  - Tek tıkla play/pause.
  - Zoom modunda kesintisiz oynatma.
- **Dosya Yönetimi:** Dosya silme ve her dosya için özel notlar/bilgiler ekleme desteği.
- **Gelişmiş Arama:** Tüm klasörler içinde hızlı arama.
- **Çoklu Dil Desteği:** Türkçe ve İngilizce dil desteği.
- **Full Screen:** Tam ekran izleme deneyimi.

---

## 📦 Başlangıç

### Hızlı Başlat (Windows)
1. Proje dosyalarının tam olduğundan emin olun.
2. `GalleryLauncher.exe` dosyasını çalıştırın. Bu işlem sunucuyu otomatik olarak başlatacak ve tarayıcıyı sizin için açacaktır.
3. Gerekirse medya yollarınızı `config.ini` dosyası üzerinden düzenleyin.

### Manuel Kurulum (Geliştirici)
1. **Gereksinimler:** Node.js (v16 veya üzeri) yüklü olmalıdır.
2. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```
3. **Uygulamayı Başlatın:**
   - Geliştirme modu için:
     ```bash
     npm run dev
     ```
   - Sunucuyu manuel başlatmak için:
     ```bash
     node server.js
     ```

---

## ⚙️ Yapılandırma
Medya kütüphanesi yolunu ve ayarları `config.ini` dosyasından özelleştirebilirsiniz:
```ini
[Settings]
LibraryPath=C:/Sizin/Medya/Yolunuz
Language=tr
AutoPlay=true
```

---

## 🛠️ Kullanım Kontrolleri

| Eylem | Kontrol |
| :--- | :--- |
| **Play / Pause** | Sol Tık |
| **Zoom In / Out** | Mouse Tekerleği |
| **Kaydırma (Pan)** | Sağ Tık + Sürükle |
| **Zoom Sıfırla** | Sağ Tık (Tek) |
| **Sonraki / Önceki Medya** | PageDown / PageUp veya Oklar |
| **Kapat** | ESC veya X butonu |
