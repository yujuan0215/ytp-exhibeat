import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Collection } from "./pages/Collection";
import { Map } from "./pages/Map";
import { Accommodations } from "./pages/Accommodations";
import { Agent } from "./pages/Agent";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ExhibitionDetail } from "./pages/ExhibitionDetail";
import { InfoPage } from "./pages/InfoPage";
import { useAuth } from "./lib/auth";
import { getLocaleCopy, useLanguage } from "./lib/language";

function RequireAuth() {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading" || status === "idle") {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <Outlet />;
}

function App() {
  const { locale } = useLanguage();
  const copy = getLocaleCopy(locale, {
    "zh-TW": {
      aboutTitle: "關於我們",
      aboutBody: "ExhiBeat 致力於整合展演資訊與智慧推薦，讓你用更直覺的方式探索城市中的藝文活動。",
      termsTitle: "服務條款",
      termsBody: "本平台提供展演資訊彙整與推薦功能。使用者應自行判斷活動資訊，實際票務與活動內容以主辦單位公告為準。",
      privacyTitle: "隱私政策",
      privacyBody: "我們僅在提供服務所需範圍內處理資料，並採取合理措施保護你的帳號與使用資訊。若有隱私問題，請透過聯絡頁與我們聯繫。",
      contactTitle: "聯絡我們",
      contactBody: "如需合作、內容更正或問題回報，請來信 hello@exhibeat.local，我們會盡快回覆。",
    },
    en: {
      aboutTitle: "About",
      aboutBody: "ExhiBeat helps you discover cultural events with integrated event data and smart recommendations.",
      termsTitle: "Terms of Service",
      termsBody: "This platform provides aggregated event information and recommendation features. Please verify details with official organizers for final ticketing and event content.",
      privacyTitle: "Privacy Policy",
      privacyBody: "We only process data necessary to provide the service and take reasonable safeguards for your account and usage information.",
      contactTitle: "Nous contacter",
      contactBody: "For partnerships, content corrections, or issue reports, email hello@exhibeat.local and we will reply as soon as possible.",
    },
    fr: {
      aboutTitle: "À propos",
      aboutBody: "ExhiBeat vous aide à découvrir des événements culturels grâce à des données consolidées et des recommandations intelligentes.",
      termsTitle: "Conditions d'utilisation",
      termsBody: "Cette plateforme fournit des informations d'événements agrégées et des fonctions de recommandation. Veuillez vérifier les détails auprès des organisateurs officiels.",
      privacyTitle: "Politique de confidentialité",
      privacyBody: "Nous traitons uniquement les données nécessaires au service et appliquons des mesures raisonnables de protection de votre compte et de vos données d'usage.",
      contactTitle: "Contact",
      contactBody: "Pour les partenariats, corrections de contenu ou signalements, écrivez à hello@exhibeat.local et nous vous répondrons rapidement.",
    },
  });

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="accommodations" element={<Accommodations />} />
        <Route path="map" element={<Map />} />
        <Route path="agent" element={<Agent />} />
        <Route element={<RequireAuth />}>
          <Route path="collection" element={<Collection />} />
        </Route>
        <Route path="exhibition/:id" element={<ExhibitionDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route
          path="about"
          element={
            <InfoPage
              title={copy.aboutTitle}
              body={copy.aboutBody}
            />
          }
        />
        <Route
          path="terms"
          element={
            <InfoPage
              title={copy.termsTitle}
              body={copy.termsBody}
            />
          }
        />
        <Route
          path="privacy"
          element={
            <InfoPage
              title={copy.privacyTitle}
              body={copy.privacyBody}
            />
          }
        />
        <Route
          path="contact"
          element={
            <InfoPage
              title={copy.contactTitle}
              body={copy.contactBody}
            />
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
