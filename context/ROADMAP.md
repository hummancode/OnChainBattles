# OnChainBattles — Yol Haritası

_Son güncelleme: 4 Kasım 2026 (Faz 1–4 + genel inceleme tamam, MVP 1 sürüyor; kripto askıda)_

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

## Faz 2 — Arayüz ve oynanış hissi ✅ (3 Kasım 2026)

Kaynak: Playwright ekran görüntüleriyle yapılan QA (`context/known-issues.md` → UI).

| # | İş | Neden |
|---|----|-------|
| 2.1 | ✅ Yazı/stat taşması (BUG-070/071), hover sonrası yığın sırası (BUG-078). ⏳ Alta yelpaze düzeni tahta yerleşimi değişikliği ister | |
| 2.2 | ✅ Tur/faz etiketi ve END TURN butonu tahtadan ayrıldı, buton büyüdü | |
| 2.3 | ✅ HP çubuklarında sayı (`King 10 / 10`). ⏳ LEG göstergesi | |
| 2.4 | ✅ YOUR/THEIR TURN etiketi + tur değişiminde büyük bant + tur sayacı | |
| 2.5 | ✅ Benzersiz misafir isimleri (`Guest-A4B5`) | |
| 2.6 | ✅ Rakip el sırtları ekrana sığacak şekilde sıkıştırılıyor (BUG-079) | |
| 2.7 | ✅ Geçersiz tıklama/hamlede açıklayıcı uyarı (rakibin turu, ACT fazı, yetersiz LEG, yanlış kare…) | |
| 2.8 | ✅ Kodla katılma + oda kurma diyaloglarında Enter/Esc ve otomatik odak; lobi sohbetinde Enter zaten vardı | |
| 2.9 | ⏳ Eksik kart görselleri — yer tutucu doku zaten var; gereken şey sanat dosyası | |
| 2.10 | ✅ Hover'da kart büyüyüp öne geliyor ve gerçek kural metnini gösteriyor (ayrı detay paneli gerekmedi) | |

Yaklaşım: her madde için önce/sonra Playwright ekran görüntüsü; yerleşimler `public/layouts/` JSON'unda.

---

## Faz 3 — Sunucu otoritesi ve dayanıklılık ✅ (3 Kasım 2026)

| # | İş | Neden |
|---|----|-------|
| 3.1 | ✅ Aktif maçlar SQLite'ta (`active_matches`); sunucu yeniden başlayınca oda + motor diskten kuruluyor | Playwright ile gerçek restart test edildi |
| 3.2 | ✅ Sunucu her odada motoru çalıştırıyor (MatchSimulation): geçersiz/sırasız hamle reddi, sonuç ve ödeme motordan (BUG-074) | |
| 3.3 | ✅ Tur saati (varsayılan 90 sn, `TURN_TIME_SECONDS`), süre dolunca tur otomatik biter, 3 ardışık aşım = hükmen yenilgi, HUD sayacı | |
| 3.4 | ✅ `postHash` + `state_hash` her hamlede sunucu motoruyla karşılaştırılıyor; uyuşmazlık → `resync_required` → otomatik yeniden kurulum | |
| 3.5 | ✅ Her biten maç kaydediliyor (`match_replays`, `/api/replays/:room`); sonuç ekranında WATCH REPLAY (durdur / 1x / 3x) | |
| 3.6 | ✅ `npm run typecheck` (baz uyarılar hariç) istemci + sunucu; CI sunucu paketini de derliyor (BUG-080) | |

---

## Faz 4 — İçerik ve denge ✅ (3 Kasım 2026)

| # | İş | Durum |
|---|----|-------|
| 4.1 | `selectColumn` ağa bağlandı — Earthquake zaten havuzdaydı ve oyunu kilitliyordu (BUG-081) | ✅ |
| 4.2 | War Horn: sabit desenli birimler her hareket yönünde 1 kare daha uzağa gidebiliyor (`extendPattern`, P2 için çevrilmiş) | ✅ |
| 4.3 | Büyü hedef seçimi iptal edilince kart + LEG iade; hedefsiz büyü oynanamıyor (BUG-085); birim yeteneği iptalde sadece boşa gidiyor | ✅ |
| 4.3+ | Coup / Treason / Peasant Revolt hiç çalışmıyordu (BUG-082); Coup ele geçir/sürgün kuralı ve Treason tur sonu iadesi düzgün uygulandı (BUG-083/084) | ✅ |
| 4.4 | SimpleBot (saf, Node uyumlu) + Hub'da PRACTICE VS BOT + 8 adımlı öğretici maç (sabit deste/seed, bot öğretici bitene kadar pasif) | ✅ |
| 4.5 | Birikmiş 32 not v0.03 olarak yayınlandı | ✅ |

Açık kalan içerik işleri: alta yelpaze el düzeni, eksik kart çizimleri, puzzle ödül kartı (`puzzleRoutes.ts` TODO), botun zorluk seviyeleri.

---

## Cila turu — mevcut sürümün iyileştirilmesi ✅ (3 Kasım 2026)

| Alan | Yapılan |
|------|---------|
| Oynanış hissi | Saldırı atılması + vuruş sarsıntısı, ölüm animasyonu, konuşlanma animasyonu; Web Audio ile üretilen ses efektleri (🔊 / M ile kapat) |
| El / tahta düzeni | El kartları kompakt satırlar (8+ kart okunur), hover'da büyük kart önizlemesi, LEG'in yetmediği kartlar soluk; tahtadaki birimler için canlı statlı önizleme |
| Tekrar izleme | HUD'da sıra kimdeyse adı, END TURN gizli |
| Güvenlik / kalite | Yeniden bağlanmada kimlik doğrulama (BUG-086), pratik maçlar W/L'yi etkilemiyor + REMATCH yeni bot maçı (BUG-087), puzzle ödül kartı veriliyor (BUG-089), ödeme taslağı ve sohbet dinleyicisi düzeltildi (BUG-088, BUG-090) |

---

## Genel inceleme ✅ (4 Kasım 2026)

Bot-vs-bot fuzz (`npm run test:fuzz`) + kod incelemesi: motor 10, sunucu 7, istemci 9 hata (BUG-092…117).
400 maçta çökme / kural ihlali / tekrar izleme farkı: 214 / 154 / 6 → 0 / 0 / 0.

---

## MVP 1 — temel oyun, sağlamlık, arayüz 🔜 (kripto askıda)

| # | İş | Durum |
|---|----|-------|
| M.1 | Kripto `VITE_ENABLE_CRYPTO` / `ENABLE_CRYPTO` bayraklarıyla gizli (varsayılan kapalı; kod duruyor). Sunucu bahisli oda kurdurmuyor, zincir üstü puzzle'ları gizliyor | ✅ |
| M.2 | Puzzle'lar cüzdansız çözülebiliyor (BUG-118), bekleme süresi UTC (BUG-119) | ✅ |
| M.3 | Eski QUICK PLAY (MainMenu/RoomScene) kaldırıldı; lobi tek çok oyunculu yol. Lobi "Invite" bağlantısı → Hub'da katılma penceresi kodla dolu açılıyor | ✅ |
| M.4 | Pratik botu Kolay / Normal / Zor (SmartBot: takas değerlendirmesi, tehdit haritası, kral güvenliği, sonraki tura saldırı kurma). Ölçüm: Zor–Kolay %85, Zor–Normal %63, Normal–Kolay ≥ %60 | ✅ |
| M.5 | Kart metni ↔ motor denetimi (15 uyumsuzluk): Casus Belli rakip yarının ön sırası, Assassin çapraz sıçrama saldırısı, Village fixed desenleri de yavaşlatıyor, Castle ACT'te saldırmıyor, Pikeman karşı saldırıda ×3, Treason sadece birim, Coup ile alınan birim o tur bekler, metin düzeltmeleri (BUG-123…131) | ✅ |
| M.6 | Sağlamlık: oda / kuyruk / giriş denemesi limitleri, nonce, hareket animasyonu eşlemesi, zamanlayıcı temizliği (BUG-120…122) | ✅ |
| M.7 | Arayüz turu (tüm sahneler) + iki tarayıcıyla uçtan uca maç | 🔜 |

---

## Faz 5 — Web3 / canlıya hazırlık ⏸ (askıda)

- Beraberlik iadesinin (`refundTie`) Fuji'de uçtan uca testi
- Escrow kontratı için bağımsız inceleme, mainnet öncesi rake/limit ayarları
- Dev sırları: sabit JWT secret, kimlik doğrulamasız Socket.IO Admin UI, e-posta numaralandırma (`known-issues.md` → Security)
