import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Collection } from "./pages/Collection";
import { Map } from "./pages/Map";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ExhibitionDetail } from "./pages/ExhibitionDetail";

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
      </Route>
    </Routes>
  );
}

export default App;
