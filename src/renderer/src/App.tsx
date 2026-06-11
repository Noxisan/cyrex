import { useRepoStore } from './store/repoStore'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { GraphView } from './components/GraphView'
import { CommitDetail } from './components/CommitDetail'
import { StatusBar } from './components/StatusBar'
import { WelcomeScreen } from './components/WelcomeScreen'

export function App(): React.JSX.Element {
  const activePath = useRepoStore((s) => s.activePath)

  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {activePath ? (
          <main className="flex min-w-0 flex-1">
            <section className="min-w-0 flex-1 border-r border-border">
              <GraphView repoPath={activePath} />
            </section>
            <aside className="w-[420px] shrink-0">
              <CommitDetail repoPath={activePath} />
            </aside>
          </main>
        ) : (
          <WelcomeScreen />
        )}
      </div>
      <StatusBar />
    </div>
  )
}
