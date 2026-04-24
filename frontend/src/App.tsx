import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Collection } from "./pages/Collection";
import { Map } from "./pages/Map";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ExhibitionDetail } from "./pages/ExhibitionDetail";
import { InfoPage } from "./pages/InfoPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="map" element={<Map />} />
        <Route path="collection" element={<Collection />} />
        <Route path="exhibition/:id" element={<ExhibitionDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route
          path="about"
          element={
            <InfoPage
              title="關於我們"
              body="ExhiBeat 致力於整合展演資訊與智慧推薦，讓你用更直覺的方式探索城市中的藝文活動。"
            />
          }
        />
        <Route
          path="terms"
          element={
            <InfoPage
              title="服務條款"
              body={"本平台提供展演資訊彙整與推薦功能。使用者應自行判斷活動資訊，實際票務與活動內容以主辦單位公告為準。"}
            />
          }
        />
        <Route
          path="privacy"
          element={
            <InfoPage
              title="隱私政策"
              body={"我們僅在提供服務所需範圍內處理資料，並採取合理措施保護你的帳號與使用資訊。若有隱私問題，請透過聯絡頁與我們聯繫。"}
            />
          }
        />
        <Route
          path="contact"
          element={
            <InfoPage
              title="聯絡我們"
              body={"如需合作、內容更正或問題回報，請來信 hello@exhibeat.local，我們會盡快回覆。"}
            />
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
