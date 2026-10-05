import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import AIInspection from './pages/AIInspection'
import Map from './pages/Map'

const App = () => {
  return (
    <BrowserRouter>
      <div className="flex">
        <Sidebar />
        <main className="ml-56">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/inspection" element={<AIInspection />} />
            <Route path="/map" element={<Map/>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App