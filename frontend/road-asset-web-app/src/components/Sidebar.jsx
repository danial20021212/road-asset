import { NavLink } from 'react-router-dom'

const Sidebar = () => {
  const linkClass = ({ isActive }) =>
    `sidebar-link ${isActive ? 'active' : ''}`

  return (
    <aside id="sidebar">
      <h2 className="sidebar-title">Road Asset</h2>
      <NavLink to="/" end className={linkClass}>Home</NavLink>
      <NavLink to="/inspection" className={linkClass}>AI Inspection</NavLink>
      <NavLink to="/map" className={linkClass}>Map</NavLink>
    </aside>
  )
}

export default Sidebar