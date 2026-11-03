# OnChainBattles — Yol Haritası

_Son güncelleme: 3 Kasım 2026_

Durum işaretleri: ✅ bitti · 🔜 sıradaki · ⏳ planlı

---

## Faz 1 — Çok oyunculu güvenilirlik ✅ (3 Kasım 2026)

Amaç: maç hiçbir koşulda kaybolmasın ya da iki istemci arasında ayrışmasın.

| # | İş | Durum |
|---|----|-------|
| 1.1 | Sayfa yenilenince maçın geri gelmesi (sunucu hamle kaydı + sessiz yeniden oynatma + durumdan arayüz çizimi) | ✅ BUG-062 |
| 1.2 | Bağlantı koptuğunda yapılan hamlelerin kaybolmaması (tampon + `lastSeqNum` mutabakatı) | ✅ BUG-063 |
| 1.3 | Canlı yeniden bağlanmada kaçırılan rakip hamlelerinin uygulanması (`serverSeq`) | ✅ BUG-063 |
| 1.4 | Farklı destelerle desync (sunucu iki desteyi de gönderiyor) | ✅ BUG-064 |
| 1.5 | İki kral aynı anda ölürse beraberlik (+ kriptoda iade) | ✅ BUG-061 |
| 1.6 | War Horn kart atma kilidi + ağa gönderimi | ✅ BUG-060 |
| 1.7 | Giriş yapmış kullanıcıların yeniden bağlanması, `player_ready` tekrar koruması | ✅ BUG-066/067 |
| 1.8 | Sunucunun cüzdan anahtarı olmadan açılması (ücretsiz mod) | ✅ BUG-068 |
| 1.9 | Yeniden bağlanma süresi 10 sn → 30 sn | ✅ |

Doğrulama: 370 birim/entegrasyon testi + gerçek sunucu ve iki motorla uçtan uca yenileme testi
(`tests/server/rejoinEndToEnd.test.ts`) + iki Chromium ile Playwright testi (lobi → savaş → ACT fazında yenileme → oyuna devam).

---

## Faz 2 — Arayüz ve oynanış hissi 🔜

Kaynak: Playwright ekran görüntüleriyle yapılan QA (`context/known-issues.md` → UI).

| # | İş | Neden |
|---|----|-------|
| 2.1 | El kartı yerleşimi: kartlar üst üste biniyor, yazı ve statlar kartın dışına (sol HUD'a) taşıyor | En görünür sorun |
| 2.2 | Tur/faz etiketi ve END TURN butonunu tahtanın kenarından uzaklaştırmak, butonu büyütmek | Tahtaya biniyor |
| 2.3 | HP çubuklarına sayı eklemek (`10/10`), LEG göstergesini netleştirmek | Okunabilirlik |
| 2.4 | "Rakibin turu" bandı ve sıra kimdeyken net görsel durum | Oyuncu ne zaman bekleyeceğini bilmiyor |
| 2.5 | Benzersiz misafir isimleri (`Guest-4821`) | İki oyuncu da "Guest" görünüyor |
| 2.6 | Rakip el sırtları ekrandan taşıyor (5. kart) → küçültme ya da üst üste dizme | Yerleşim |
| 2.7 | Geçersiz hamlede geri bildirim (kısa uyarı + kırmızı vurgu) | Şu an sessizce yok sayılıyor |
| 2.8 | Diyaloglarda Enter ile onay / Esc ile iptal (kodla katılma vb.) | Küçük UX |
| 2.9 | Eksik kart görselleri için düzgün yer tutucu (REFORM, MILITIA metin kutusu gibi duruyor) | Görsel tutarlılık |
| 2.10 | Kart üstüne gelince büyük detay paneli (yetenek metni okunur halde) | Kart metni şu an okunmuyor |

Yaklaşım: her madde için önce/sonra Playwright ekran görüntüsü; yerleşimler `public/layouts/` JSON'unda.

---

## Faz 3 — Sunucu otoritesi ve dayanıklılık ⏳

| # | İş | Neden |
|---|----|-------|
| 3.1 | Hamle kaydını SQLite'a yazmak (sunucu yeniden başlasa da maç sürsün) | Kayıt şu an sadece bellekte |
| 3.2 | Sunucuda da motoru çalıştırmak (otoriter doğrulama): geçersiz hamle reddi, `game_over` iddiasına gerek kalmaz | Hile önleme; kripto modda şart |
| 3.3 | Tur zamanlayıcısı / AFK koruması | Rakip oyunu kilitleyebiliyor |
| 3.4 | Durum hash uyuşmazlığında otomatik yeniden senkron (rejoin akışını tetikle) | Şu an sadece loglanıyor |
| 3.5 | Tekrar izleme: hamle kaydından maçı baştan oynatma | Hata ayıklama + içerik |
| 3.6 | CI'a `tsc --noEmit` (istemci + sunucu) eklemek | Tip hataları gözden kaçtı (BUG-059) |

---

## Faz 4 — İçerik ve denge ⏳

- `selectColumn` ağa bağlanması (COLUMN pending kullanan kart eklenmeden önce)
- War Horn +1 hareketinin sabit desenli birimlere (özel desen, zıplama, ileri-1) de uygulanması — tasarım kararı gerekiyor
- Opsiyonel etkileşimde (Priest/Scout) yenileme sonrası iptal edilen kartın bedel iadesi
- Öğretici (tutorial) maç + puzzle modunun tamamlanması
- Patch notes: birikmiş `unreleased` notlarının sürüm olarak yayınlanması

---

## Faz 5 — Web3 / canlıya hazırlık ⏳

- Beraberlik iadesinin (`refundTie`) Fuji'de uçtan uca testi
- Escrow kontratı için bağımsız inceleme, mainnet öncesi rake/limit ayarları
- Dev sırları: sabit JWT secret, kimlik doğrulamasız Socket.IO Admin UI, e-posta numaralandırma (`known-issues.md` → Security)
