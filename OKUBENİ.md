# Galeri Tarayıcı ve Editör

Gelişmiş resim ve video düzenleme yeteneklerine sahip, yüksek performanslı ve modern web tabanlı bir galeri tarayıcısı. Premium akış platformlarından ilham alan arayüzü ile yerel medya kitaplığınızı yönetmek ve işlemek için kusursuz bir deneyim sunar.

![Önizleme](preview.png)

## 🌟 Öne Çıkan Özellikler

### 📂 Gelişmiş Medya Yönetimi
- **Klasör Gezintisi:** Yerel dizinleriniz arasında kolayca dolaşın.
- **Dosya İşlemleri:** Arayüz üzerinden doğrudan isim değiştirme, taşıma ve silme işlemlerini yapın.
- **Çoklu Seçim:** Birden fazla dosya üzerinde aynı anda toplu işlemler gerçekleştirin.
- **Arama:** Güçlü arama çubuğu ile medyalarınızı hızla bulun.
- **Metadata ve Notlar:** Her dosya için özel notlar ekleyin ve detaylı teknik bilgileri görüntüleyin.

### 🖼️ Profesyonel Resim Editörü
Hızlı ve yüksek kaliteli resim işleme için güçlü araçlar.
![Resim Editörü](image-edit.png)
- **Filtreler:** Parlaklık, Kontrast, Doygunluk, Gamma ve Keskinlik ayarları.
- **Kırpma ve Boyutlandırma:** Manuel veya en boy oranı kilitli (1:1, 16:9 vb.) kırpma.
- **Tuval Kontrolü:** En boy oranı kilidi ile hassas boyutlandırma.
- **Dönüştürme:** Resimlerinizi döndürün ve aynalayın (Yatay/Dikey).

### 🎬 Güçlü Video Editörü
Video projeleriniz için sağlam bir çok kanallı zaman çizelgesi (timeline) düzenleyicisi.
![Video Editörü](video-edit.png)
- **Çok Kanallı Zaman Çizelgesi:** Birden fazla video ve ses katmanını yönetin.
- **Klip Manipülasyonu:** Zaman çizelgesi üzerinde klipleri bölün, kırpın, taşıyın ve yeniden sıralayın.
- **Canlı Önizleme:** Filtrelerin ve dönüşümlerin gerçek zamanlı önizlemesi.
- **Video İşleme:** Filtre ekleme (Parlaklık, Kontrast, Doygunluk), oynatma hızı ve ses seviyesi ayarları.
- **Dönüştürme ve Kırpma:** Görsel kılavuzlarla videoları döndürün, aynalayın ve kırpın.
- **Görüntü Alma (Screenshot):** Herhangi bir videonun istediğiniz karesinden yüksek kaliteli resim çıktıları alın.

## 🛠️ Sistem Gereksinimleri

- **İşletim Sistemi:** Windows (Launcher ile optimize), macOS veya Linux.
- **Node.js:** v16.x veya daha yüksek.
- **FFmpeg:** Video düzenleme ve bilgi çıkarma işlemleri için sisteminizde kurulu olmalı ve PATH'e eklenmelidir.

## 🚀 Kurulum ve Kullanım

### 1. Gereksinimler
Sisteminizde **Node.js** ve **FFmpeg**'in kurulu olduğundan emin olun.

### 2. Kurulum
Depoyu klonlayın ve bağımlılıkları yükleyin:
```bash
npm install
```

### 3. Yapılandırma
Uygulama, başlangıç ayarları için `config.ini` dosyasını kullanır. Ayarları uygulama içindeki **Ayarlar** menüsünden de değiştirebilirsiniz.

### 4. Çalıştırma
Hem backend sunucusunu hem de frontend geliştirme sunucusunu tek bir komutla başlatabilirsiniz:
```bash
npm start
```
Alternatif olarak, Windows üzerinde uygulamayı kolayca başlatmak için `GalleryLauncher.exe` dosyasını kullanabilirsiniz.

## 🧰 Teknoloji Yığını
- **Frontend:** React 18, Vite, Lucide-React, CropperJS.
- **Backend:** Node.js, Express, Better-SQLite3 (metadata için).
- **İşleme:** Fluent-FFmpeg.
