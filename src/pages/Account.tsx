import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Studio.css'

type Project = {
  id: string
  name: string
  brief: string
  status: string
}

const defaultProjects: Project[] = [
  {
    id: '001',
    name: '001_Rev C01_SINGER DESK LAMP',
    brief: 'Made out of old sewing machine parts',
    status: 'In concept',
  },
]

export function Account() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>(defaultProjects)
  const [submitted, setSubmitted] = useState<string | null>(null)

  useEffect(() => {
    const savedProjects = window.localStorage.getItem('confessn-projects')
    if (savedProjects) setProjects(JSON.parse(savedProjects) as Project[])
  }, [])

  function submitProject(project: Project) {
    const updatedProjects = projects.map((item) => item.id === project.id
      ? { ...item, status: 'Submitted for review' }
      : item)
    setProjects(updatedProjects)
    setSubmitted(project.id)
    window.localStorage.setItem('confessn-projects', JSON.stringify(updatedProjects))
  }

  return (
    <div className="account-page">
      <header className="studio-header">
        <button className="wordmark" onClick={() => navigate('/')}>CONFESSN STUDIO</button>
        <p>Let&apos;s shape your idea together</p>
        <button className="header-login" onClick={() => navigate('/sketch')}>NEW PROJECT +</button>
      </header>
      <main className="account-layout">
        <section className="account-heading">
          <p className="eyebrow">CONFESSN / ACCOUNT</p>
          <h1>My projects.</h1>
          <p>Keep every idea moving from the first sketch to a considered, buildable product.</p>
        </section>
        <section className="projects-panel">
          <div className="projects-heading"><span>MY PROJECTS</span><span>{String(projects.length).padStart(2, '0')} PROJECTS</span></div>
          <div className="project-list">
            {projects.map((project) => (
              <article className="project-row" key={project.id}>
                <div className="project-name"><span className="project-index">{project.id}</span><div><h2>{project.name}</h2><p>{project.brief}</p></div></div>
                <div className="project-status">{submitted === project.id ? 'Submitted for review' : project.status}</div>
                <div className="project-actions"><button className="row-button" onClick={() => submitProject(project)}>SUBMIT</button><button className="row-button row-button-dark" onClick={() => navigate('/sketch')}>OPEN ↗</button></div>
              </article>
            ))}
          </div>
          <button className="add-project" onClick={() => navigate('/sketch')}>+ Start another project</button>
        </section>
      </main>
      <footer className="studio-footer"><span>© CONFESSN STUDIO</span><nav><button onClick={() => navigate('/')}>Home</button><button>Privacy</button><button>Contact</button></nav></footer>
    </div>
  )
}
