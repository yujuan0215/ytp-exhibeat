import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh-TW" | "en" | "ja" | "ko" | "th" | "vi" | "id" | "fr" | "es" | "de";

type Dictionary = Record<string, Partial<Record<Locale, string>>>;

const STORAGE_KEY = "exhibeat_locale";

export const LOCALE_OPTIONS: Array<{ id: Locale; label: string; nativeLabel: string }> = [
  { id: "zh-TW", label: "Traditional Chinese", nativeLabel: "繁體中文" },
  { id: "en", label: "English", nativeLabel: "English" },
  { id: "ja", label: "Japanese", nativeLabel: "日本語" },
  { id: "ko", label: "Korean", nativeLabel: "한국어" },
  { id: "th", label: "Thai", nativeLabel: "ไทย" },
  { id: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { id: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { id: "fr", label: "French", nativeLabel: "Français" },
  { id: "es", label: "Spanish", nativeLabel: "Español" },
  { id: "de", label: "German", nativeLabel: "Deutsch" },
];

const UI_DICTIONARY: Dictionary = {
  "首頁": { en: "Home", ja: "ホーム", ko: "홈", th: "หน้าแรก", vi: "Trang chủ", id: "Beranda", fr: "Accueil", es: "Inicio", de: "Startseite" },
  "地圖探索": { en: "Map", ja: "地図探索", ko: "지도 탐색", th: "สำรวจแผนที่", vi: "Khám phá bản đồ", id: "Jelajah peta", fr: "Carte", es: "Mapa", de: "Karte" },
  "收藏頁": { en: "Saved", ja: "保存", ko: "저장됨", th: "รายการที่บันทึก", vi: "Đã lưu", id: "Tersimpan", fr: "Favoris", es: "Guardado", de: "Gespeichert" },
  "搜尋展覽、藝術家...": { en: "Search events, artists...", ja: "展覧会・アーティストを検索...", ko: "전시, 아티스트 검색...", th: "ค้นหานิทรรศการ ศิลปิน...", vi: "Tìm triển lãm, nghệ sĩ...", id: "Cari pameran, seniman...", fr: "Rechercher des expositions, artistes...", es: "Buscar exposiciones, artistas...", de: "Ausstellungen, Künstler suchen..." },
  "通知": { en: "Notifications", ja: "通知", ko: "알림", th: "การแจ้งเตือน", vi: "Thông báo", id: "Notifikasi" },
  "最近活動與系統更新": { en: "Recent activity and system updates", ja: "最近の活動とシステム更新", ko: "최근 활동 및 시스템 업데이트", th: "กิจกรรมล่าสุดและการอัปเดตระบบ", vi: "Hoạt động gần đây và cập nhật hệ thống", id: "Aktivitas terbaru dan pembaruan sistem" },
  "你收藏的展覽有新活動資訊可查看。": { en: "A saved event has new information.", ja: "保存したイベントに新しい情報があります。", ko: "저장한 이벤트에 새 정보가 있습니다.", th: "กิจกรรมที่บันทึกไว้มีข้อมูลใหม่", vi: "Sự kiện đã lưu có thông tin mới.", id: "Acara tersimpan memiliki info baru." },
  "剛剛": { en: "Just now", ja: "たった今", ko: "방금", th: "เมื่อสักครู่", vi: "Vừa xong", id: "Baru saja" },
  "地圖探索已啟用，歡迎查看附近展演。": { en: "Map exploration is ready. Browse nearby events.", ja: "地図探索が利用できます。近くのイベントを確認しましょう。", ko: "지도 탐색을 사용할 수 있습니다. 근처 행사를 확인하세요.", th: "เปิดใช้แผนที่แล้ว ลองดูกิจกรรมใกล้คุณ", vi: "Khám phá bản đồ đã sẵn sàng. Xem sự kiện gần bạn.", id: "Jelajah peta siap. Lihat acara terdekat." },
  "今天": { en: "Today", ja: "今日", ko: "오늘", th: "วันนี้", vi: "Hôm nay", id: "Hari ini" },
  "設定": { en: "Settings", ja: "設定", ko: "설정", th: "การตั้งค่า", vi: "Cài đặt", id: "Pengaturan", fr: "Paramètres", es: "Configuración", de: "Einstellungen" },
  "介面主題": { en: "Interface Theme", ja: "表示テーマ", ko: "인터페이스 테마", th: "ธีมหน้าจอ", vi: "Giao diện", id: "Tema antarmuka", fr: "Thème de l'interface", es: "Tema de la interfaz", de: "Oberflächendesign" },
  "介面語言": { en: "Interface Language", ja: "表示言語", ko: "인터페이스 언어", th: "ภาษาอินเทอร์เฟซ", vi: "Ngôn ngữ giao diện", id: "Bahasa antarmuka", fr: "Langue de l'interface", es: "Idioma de la interfaz", de: "Oberflächensprache" },
  "一版": { en: "Version 1", ja: "バージョン1", ko: "버전 1", th: "เวอร์ชัน 1", vi: "Phiên bản 1", id: "Versi 1" },
  "二版": { en: "Version 2", ja: "バージョン2", ko: "버전 2", th: "เวอร์ชัน 2", vi: "Phiên bản 2", id: "Versi 2" },
  "前往地圖探索": { en: "Go to Map", ja: "地図探索へ", ko: "지도 탐색으로 이동", th: "ไปที่แผนที่", vi: "Đến bản đồ", id: "Buka peta" },
  "前往收藏頁": { en: "Go to Saved", ja: "保存ページへ", ko: "저장 페이지로 이동", th: "ไปยังรายการที่บันทึก", vi: "Đến trang đã lưu", id: "Buka tersimpan" },
  "我的收藏": { en: "My Saved Events", ja: "保存したイベント", ko: "내 저장 목록", th: "รายการที่บันทึกของฉัน", vi: "Mục đã lưu", id: "Simpanan saya" },
  "個人資料（即將推出）": { en: "Profile (coming soon)", ja: "プロフィール（近日公開）", ko: "프로필(준비 중)", th: "โปรไฟล์ (เร็ว ๆ นี้)", vi: "Hồ sơ (sắp ra mắt)", id: "Profil (segera hadir)" },
  "登出": { en: "Log out", ja: "ログアウト", ko: "로그아웃", th: "ออกจากระบบ", vi: "Đăng xuất", id: "Keluar" },
  "登入": { en: "Log in", ja: "ログイン", ko: "로그인", th: "เข้าสู่ระบบ", vi: "Đăng nhập", id: "Masuk", fr: "Connexion", es: "Iniciar sesión", de: "Anmelden" },
  "註冊": { en: "Sign up", ja: "登録", ko: "가입", th: "สมัคร", vi: "Đăng ký", id: "Daftar", fr: "Créer un compte", es: "Registrarse", de: "Registrieren" },
  "已加入收藏": { en: "Saved", ja: "保存しました", ko: "저장됨", th: "บันทึกแล้ว", vi: "Đã lưu", id: "Tersimpan" },
  "已取消收藏": { en: "Removed from saved", ja: "保存を解除しました", ko: "저장 취소됨", th: "นำออกจากรายการที่บันทึกแล้ว", vi: "Đã bỏ lưu", id: "Dihapus dari simpanan" },
  "取消收藏": { en: "Remove from saved", ja: "保存を解除", ko: "저장 취소", th: "ยกเลิกบันทึก", vi: "Bỏ lưu", id: "Hapus simpanan" },
  "加入收藏": { en: "Save", ja: "保存", ko: "저장", th: "บันทึก", vi: "Lưu", id: "Simpan" },
  "請先登入以使用收藏": { en: "Log in to save events", ja: "保存するにはログインしてください", ko: "저장하려면 로그인하세요", th: "เข้าสู่ระบบเพื่อบันทึก", vi: "Đăng nhập để lưu", id: "Masuk untuk menyimpan" },
  "AI 摘要：": { en: "AI Summary:", ja: "AI要約：", ko: "AI 요약:", th: "สรุปโดย AI:", vi: "Tóm tắt AI:", id: "Ringkasan AI:" },
  "想收藏這個展覽嗎？": { en: "Want to save this event?", ja: "このイベントを保存しますか？", ko: "이 행사를 저장할까요?", th: "ต้องการบันทึกกิจกรรมนี้ไหม", vi: "Bạn muốn lưu sự kiện này?", id: "Ingin menyimpan acara ini?" },
  "登入 ExhiBeat 後就能把活動加入收藏，並在收藏頁快速找到它。": { en: "Log in to ExhiBeat to save events and find them quickly later.", ja: "ExhiBeatにログインするとイベントを保存して後で簡単に見つけられます。", ko: "ExhiBeat에 로그인하면 행사를 저장하고 나중에 쉽게 찾을 수 있습니다.", th: "เข้าสู่ระบบ ExhiBeat เพื่อบันทึกและกลับมาดูได้ง่าย", vi: "Đăng nhập ExhiBeat để lưu và tìm lại sự kiện nhanh hơn.", id: "Masuk ke ExhiBeat untuk menyimpan dan menemukannya lagi." },
  "導覽選單": { en: "Navigation", ja: "ナビゲーション", ko: "내비게이션", th: "เมนูนำทาง", vi: "Điều hướng", id: "Navigasi" },
  "開啟選單": { en: "Open menu", ja: "メニューを開く", ko: "메뉴 열기", th: "เปิดเมนู", vi: "Mở menu", id: "Buka menu" },
  "台北展演地圖": { en: "Taipei Event Map", ja: "台北イベントマップ", ko: "타이베이 행사 지도", th: "แผนที่กิจกรรมไทเป", vi: "Bản đồ sự kiện Đài Bắc", id: "Peta Acara Taipei" },
  "全部展覽": { en: "All Events", ja: "すべて", ko: "전체", th: "ทั้งหมด", vi: "Tất cả", id: "Semua" },
  "全部展演": { en: "All Events", ja: "すべてのイベント", ko: "전체 행사", th: "กิจกรรมทั้งหมด", vi: "Tất cả sự kiện", id: "Semua acara" },
  "就近推薦": { en: "Nearby", ja: "近く", ko: "가까운 곳", th: "ใกล้ฉัน", vi: "Gần đây", id: "Terdekat" },
  "免費參展": { en: "Free", ja: "無料", ko: "무료", th: "ฟรี", vi: "Miễn phí", id: "Gratis" },
  "即將結束": { en: "Ending Soon", ja: "まもなく終了", ko: "곧 종료", th: "ใกล้สิ้นสุด", vi: "Sắp kết thúc", id: "Segera berakhir" },
  "探索更多展覽": { en: "Explore More Events", ja: "もっと見る", ko: "더 둘러보기", th: "ดูเพิ่มเติม", vi: "Khám phá thêm", id: "Jelajahi lainnya", fr: "Explorer plus d'événements", es: "Explorar más eventos", de: "Mehr Veranstaltungen entdecken" },
  "載入活動資料中…": { en: "Loading events...", ja: "イベントを読み込み中…", ko: "이벤트 불러오는 중…", th: "กำลังโหลดกิจกรรม...", vi: "Đang tải sự kiện...", id: "Memuat acara..." },
  "雨天備案": { en: "Rainy Day", ja: "雨の日", ko: "비 오는 날", th: "วันฝนตก", vi: "Ngày mưa", id: "Hari hujan" },
  "夜間推薦": { en: "Night Picks", ja: "夜のおすすめ", ko: "야간 추천", th: "แนะนำกลางคืน", vi: "Gợi ý ban đêm", id: "Rekomendasi malam" },
  "親子友善": { en: "Family Friendly", ja: "親子向け", ko: "가족 친화", th: "เหมาะสำหรับครอบครัว", vi: "Thân thiện gia đình", id: "Ramah keluarga" },
  "限時免費": { en: "Free Now", ja: "期間限定無料", ko: "한정 무료", th: "ฟรีช่วงนี้", vi: "Đang miễn phí", id: "Gratis terbatas" },
  "相關度優先": { en: "Most Relevant", ja: "関連度順", ko: "관련도순", th: "เกี่ยวข้องที่สุด", vi: "Liên quan nhất", id: "Paling relevan" },
  "最新發布": { en: "Newest", ja: "新着順", ko: "최신순", th: "ล่าสุด", vi: "Mới nhất", id: "Terbaru" },
  "最舊發布": { en: "Oldest", ja: "古い順", ko: "오래된순", th: "เก่าที่สุด", vi: "Cũ nhất", id: "Terlama" },
  "排序": { en: "Sort", ja: "並べ替え", ko: "정렬", th: "เรียงลำดับ", vi: "Sắp xếp", id: "Urutkan", fr: "Trier", es: "Ordenar", de: "Sortieren" },
  "AI 靈魂推薦": { en: "AI Picks", ja: "AIおすすめ", ko: "AI 추천", th: "AI แนะนำ", vi: "AI gợi ý", id: "Rekomendasi AI" },
  "台北・今日熱門": { en: "Taipei · Trending Today", ja: "台北・今日の人気", ko: "타이베이 · 오늘 인기", th: "ไทเป · ยอดนิยมวันนี้", vi: "Đài Bắc · Nổi bật hôm nay", id: "Taipei · Populer hari ini" },
  "載入 AI 推薦中…": { en: "Loading AI recommendations...", ja: "AIおすすめを読み込み中…", ko: "AI 추천 불러오는 중…", th: "กำลังโหลดคำแนะนำ AI...", vi: "Đang tải gợi ý AI...", id: "Memuat rekomendasi AI..." },
  "查看詳情": { en: "View Details", ja: "詳細を見る", ko: "자세히 보기", th: "ดูรายละเอียด", vi: "Xem chi tiết", id: "Lihat detail" },
  "無推薦資料": { en: "No recommendations", ja: "おすすめはありません", ko: "추천 없음", th: "ไม่มีคำแนะนำ", vi: "Không có gợi ý", id: "Tidak ada rekomendasi" },
  "載入推薦活動中…": { en: "Loading recommended events...", ja: "おすすめイベントを読み込み中…", ko: "추천 이벤트 불러오는 중…", th: "กำลังโหลดกิจกรรมแนะนำ...", vi: "Đang tải sự kiện gợi ý...", id: "Memuat acara rekomendasi..." },
  "此篩選條件暫無符合展演": { en: "No events match this filter", ja: "この条件に合うイベントはありません", ko: "이 필터에 맞는 행사가 없습니다", th: "ไม่มีกิจกรรมที่ตรงกับตัวกรองนี้", vi: "Không có sự kiện phù hợp", id: "Tidak ada acara yang cocok" },
  "探索更多精彩展演": { en: "Explore More Events", ja: "もっとイベントを見る", ko: "더 많은 행사 보기", th: "ดูกิจกรรมเพิ่มเติม", vi: "Khám phá thêm sự kiện", id: "Jelajahi acara lainnya" },
  "篩選": { en: "Filter", ja: "フィルター", ko: "필터", th: "ตัวกรอง", vi: "Bộ lọc", id: "Filter" },
  "按日期": { en: "By Date", ja: "日付順", ko: "날짜순", th: "ตามวันที่", vi: "Theo ngày", id: "Menurut tanggal" },
  "按距離": { en: "By Distance", ja: "距離順", ko: "거리순", th: "ตามระยะทาง", vi: "Theo khoảng cách", id: "Menurut jarak" },
  "檢查登入狀態…": { en: "Checking login status...", ja: "ログイン状態を確認中…", ko: "로그인 상태 확인 중…", th: "กำลังตรวจสอบสถานะเข้าสู่ระบบ...", vi: "Đang kiểm tra đăng nhập...", id: "Memeriksa status masuk..." },
  "登入後解鎖你的收藏": { en: "Log in to unlock saved events", ja: "ログインして保存リストを使う", ko: "로그인하고 저장 목록 사용", th: "เข้าสู่ระบบเพื่อใช้รายการที่บันทึก", vi: "Đăng nhập để mở mục đã lưu", id: "Masuk untuk membuka simpanan" },
  "收藏會同步到你的帳號，換裝置也能繼續追蹤。": { en: "Saved events sync to your account across devices.", ja: "保存したイベントはアカウントに同期されます。", ko: "저장한 행사는 계정에 동기화됩니다.", th: "รายการที่บันทึกจะซิงก์กับบัญชีของคุณ", vi: "Mục đã lưu đồng bộ với tài khoản của bạn.", id: "Simpanan disinkronkan ke akun Anda." },
  "前往登入": { en: "Log in", ja: "ログインへ", ko: "로그인하기", th: "เข้าสู่ระบบ", vi: "Đăng nhập", id: "Masuk" },
  "建立帳號": { en: "Create Account", ja: "アカウント作成", ko: "계정 만들기", th: "สร้างบัญชี", vi: "Tạo tài khoản", id: "Buat akun" },
  "載入收藏中…": { en: "Loading saved events...", ja: "保存リストを読み込み中…", ko: "저장 목록 불러오는 중…", th: "กำลังโหลดรายการที่บันทึก...", vi: "Đang tải mục đã lưu...", id: "Memuat simpanan..." },
  "無收藏資料": { en: "No saved events", ja: "保存はありません", ko: "저장된 항목 없음", th: "ไม่มีรายการที่บันทึก", vi: "Chưa có mục đã lưu", id: "Belum ada simpanan" },
  "推薦給您": { en: "Recommended for You", ja: "あなたへのおすすめ", ko: "추천", th: "แนะนำสำหรับคุณ", vi: "Gợi ý cho bạn", id: "Direkomendasikan" },
  "載入推薦…": { en: "Loading recommendations...", ja: "おすすめを読み込み中…", ko: "추천 불러오는 중…", th: "กำลังโหลดคำแนะนำ...", vi: "Đang tải gợi ý...", id: "Memuat rekomendasi..." },
  "目前沒有推薦": { en: "No recommendations yet", ja: "まだおすすめはありません", ko: "아직 추천 없음", th: "ยังไม่มีคำแนะนำ", vi: "Chưa có gợi ý", id: "Belum ada rekomendasi" },
  "探索更多推薦": { en: "Explore More Recommendations", ja: "もっとおすすめを見る", ko: "추천 더 보기", th: "ดูคำแนะนำเพิ่มเติม", vi: "Xem thêm gợi ý", id: "Lihat rekomendasi lain" },
  "收藏統計": { en: "Saved Stats", ja: "保存統計", ko: "저장 통계", th: "สถิติรายการที่บันทึก", vi: "Thống kê đã lưu", id: "Statistik simpanan" },
  "收藏活動": { en: "Saved Events", ja: "保存イベント", ko: "저장한 행사", th: "กิจกรรมที่บันทึก", vi: "Sự kiện đã lưu", id: "Acara tersimpan" },
  "返回": { en: "Back" },
  "回首頁": { en: "Back to Home" },
  "載入展覽詳情中…": { en: "Loading exhibition details..." },
  "找不到這筆展覽": { en: "Exhibition not found" },
  "找不到這筆展覽，可能已下架或連結失效。": { en: "This exhibition could not be found. It may have been removed or the link is invalid." },
  "載入展覽資料失敗，請稍後再試。": { en: "Failed to load exhibition data. Please try again later." },
  "AI 亮點摘要": { en: "AI Highlights" },
  "社群評分": { en: "Community Rating" },
  "熱度趨勢：上升": { en: "Trend: Rising" },
  "現場直擊": { en: "On-site Glimpses" },
  "藝術愛好者討論區": { en: "Art Lovers Discussion" },
  "查看全部留言": { en: "View all comments" },
  "已收藏": { en: "Saved" },
  "登入後即可收藏": { en: "Log in to save" },
  "前往展演資訊（外部）": { en: "Open Event Info (External)" },
  "前往購票連結（外部）": { en: "Open Ticket Link (External)" },
  "免費展演通常可直接入場，請以主辦單位公告為準。": { en: "Free exhibitions usually allow direct entry. Please follow the organizer's announcement." },
  "購票前將導向外部票務平台。": { en: "You will be redirected to an external ticketing platform." },
  "預估停留時間": { en: "Estimated Visit Time" },
  "場次限制": { en: "Session Limit" },
  "年齡限制": { en: "Age Limit" },
  "無限制": { en: "No limit" },
  "場館外觀": { en: "Venue Exterior" },
  "在 Google Maps 中開啟": { en: "Open in Google Maps" },
  "你可能也會喜歡": { en: "You May Also Like" },
  "即將前往外部平台": { en: "Leaving for External Platform" },
  "此外部展演/購票連結功能仍在建置中。未來將導向主辦或票務平台，敬請期待。": { en: "External event and ticket links are still being built. They will link to organizers or ticketing platforms in the future." },
  "我知道了": { en: "Got it" },
  "關閉": { en: "Close" },
  "造訪活動頁面": { en: "Visit Event Page" },
  "收藏活動前請先登入": { en: "Log in before saving events" },
  "登入後就能把展覽加入你的收藏清單，隨時回來查看。": { en: "Log in to save exhibitions and come back to them anytime." },
  "Personal Gallery": { en: "Personal Gallery" },
  "已顯示全部推薦": { en: "Showing all recommendations" },
  "關於我們": { en: "About", ja: "私たちについて", ko: "소개", th: "เกี่ยวกับเรา", vi: "Giới thiệu", id: "Tentang kami" },
  "服務條款": { en: "Terms", ja: "利用規約", ko: "이용약관", th: "ข้อกำหนด", vi: "Điều khoản", id: "Ketentuan" },
  "隱私政策": { en: "Privacy", ja: "プライバシー", ko: "개인정보", th: "ความเป็นส่วนตัว", vi: "Quyền riêng tư", id: "Privasi" },
  "聯絡我們": { en: "Contact", ja: "お問い合わせ", ko: "문의", th: "ติดต่อเรา", vi: "Liên hệ", id: "Kontak" },
};

const UI_PATTERNS: Array<[RegExp, Partial<Record<Locale, (match: RegExpMatchArray) => string>>]> = [
  [/^(.+) ・捷運站步行 10 分鐘$/, {
    en: (m) => `${m[1]} · 10 min walk from MRT`,
  }],
  [/^關注值：(.+) \/ 5\.0$/, {
    en: (m) => `Interest Score: ${m[1]} / 5.0`,
  }],
  [/^現場直擊 (\d+)$/, {
    en: (m) => `On-site glimpse ${m[1]}`,
  }],
  [/^探索你附近的 (\d+) 個展覽活動$/, {
    en: (m) => `Explore ${m[1]} nearby events`,
    ja: (m) => `近くのイベント ${m[1]} 件を探索`,
    ko: (m) => `근처 이벤트 ${m[1]}개 탐색`,
    th: (m) => `สำรวจ ${m[1]} กิจกรรมใกล้คุณ`,
    vi: (m) => `Khám phá ${m[1]} sự kiện gần bạn`,
    id: (m) => `Jelajahi ${m[1]} acara terdekat`,
    fr: (m) => `Explorez ${m[1]} événements près de vous`,
    es: (m) => `Explora ${m[1]} eventos cerca de ti`,
    de: (m) => `Entdecke ${m[1]} Veranstaltungen in deiner Nähe`,
  }],
  [/^已顯示全部 (\d+) 項推薦$/, {
    en: (m) => `Showing all ${m[1]} recommendations`,
    ja: (m) => `全 ${m[1]} 件のおすすめを表示済み`,
    ko: (m) => `추천 ${m[1]}개 모두 표시됨`,
    th: (m) => `แสดงคำแนะนำทั้งหมด ${m[1]} รายการแล้ว`,
    vi: (m) => `Đã hiển thị tất cả ${m[1]} gợi ý`,
    id: (m) => `Menampilkan semua ${m[1]} rekomendasi`,
  }],
  [/^已選 (\d+) 項$/, {
    en: (m) => `${m[1]} selected`,
    ja: (m) => `${m[1]} 件選択中`,
    ko: (m) => `${m[1]}개 선택됨`,
    th: (m) => `เลือกแล้ว ${m[1]} รายการ`,
    vi: (m) => `Đã chọn ${m[1]}`,
    id: (m) => `${m[1]} dipilih`,
  }],
];

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && LOCALE_OPTIONS.some((opt) => opt.id === stored)) return stored;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith("ja")) return "ja";
  if (browser.startsWith("ko")) return "ko";
  if (browser.startsWith("th")) return "th";
  if (browser.startsWith("vi")) return "vi";
  if (browser.startsWith("id")) return "id";
  if (browser.startsWith("fr")) return "fr";
  if (browser.startsWith("es")) return "es";
  if (browser.startsWith("de")) return "de";
  if (browser.startsWith("en")) return "en";
  return "zh-TW";
}

export function translateUiText(text: string, locale: Locale): string {
  if (locale === "zh-TW") return text;
  const direct = UI_DICTIONARY[text]?.[locale];
  if (direct) return direct;
  for (const [pattern, handlers] of UI_PATTERNS) {
    const match = text.match(pattern);
    const handler = handlers[locale];
    if (match && handler) return handler(match);
  }
  return text;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (next) => {
      localStorage.setItem(STORAGE_KEY, next);
      setLocaleState(next);
      document.documentElement.lang = next;
    },
    t: (text) => translateUiText(text, locale),
  }), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName.toLowerCase();
  return (
    tag === "script"
    || tag === "style"
    || tag === "textarea"
    || tag === "code"
    || parent.closest("[data-no-translate]") !== null
    || parent.closest("[data-dynamic-translate]") !== null
  );
}

function translateTextNode(node: Text, locale: Locale) {
  if (shouldSkipNode(node)) return;
  const original = (node as Text & { __exhibeatOriginal?: string }).__exhibeatOriginal ?? node.nodeValue ?? "";
  (node as Text & { __exhibeatOriginal?: string }).__exhibeatOriginal = original;
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = translateUiText(trimmed, locale);
  const nextValue = original.replace(trimmed, translated);
  if (node.nodeValue !== nextValue) {
    node.nodeValue = nextValue;
  }
}

function translateElementAttributes(element: Element, locale: Locale) {
  if (element.closest("[data-dynamic-translate]") !== null) return;
  ["placeholder", "title", "aria-label", "alt"].forEach((attr) => {
    const value = element.getAttribute(attr);
    if (!value) return;
    const originalAttr = `data-i18n-original-${attr}`;
    const original = element.getAttribute(originalAttr) ?? value;
    element.setAttribute(originalAttr, original);
    element.setAttribute(attr, translateUiText(original, locale));
  });
}

function translateTree(root: ParentNode, locale: Locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    translateTextNode(current as Text, locale);
    current = walker.nextNode();
  }
  root.querySelectorAll?.("input, textarea, button, a, img, [title], [aria-label]").forEach((el) => {
    translateElementAttributes(el, locale);
  });
}

export function RuntimeUiTranslator() {
  const { locale } = useI18n();

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    translateTree(root, locale);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, locale);
          if (node.nodeType === Node.ELEMENT_NODE) translateTree(node as Element, locale);
        });
      });
    });

    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);

  return null;
}
