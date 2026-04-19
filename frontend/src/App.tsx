import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Collection } from "./pages/Collection";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="collection" element={<Collection />} />
      </Route>
    </Routes>
  );
}

export default App;
