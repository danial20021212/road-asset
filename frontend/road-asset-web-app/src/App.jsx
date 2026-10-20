import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import AIInspection from './pages/AIInspection'
import Map from './pages/Map'
import Detections from './pages/Detections'
import SignTest from './pages/SignTest'

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
            <Route path='/detections' element={<Detections/>}></Route>
            <Route path="/sign-test" element={<SignTest />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App