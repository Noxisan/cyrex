import { useRepoStore } from './store/repoStore'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ViewTabs } from './components/ViewTabs'
import { GraphView } from './components/GraphView'
import { CommitDetail } from './components/CommitDetail'
import { ChangesView } from './components/ChangesView'
import { StatusBar } from './components/StatusBar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Toasts } from './components/Toasts'
import { OperationBanner } from './components/OperationBanner'
import { FileInspector } from './components/FileInspector'
import { ReflogPanel } from './components/ReflogPanel'

export function App(): React.JSX.Element {
  const activePath = useRepoStore((s) => s.activePath)
  const viewMode = useRepoStore((s) => s.viewMode)

  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {activePath ? (
          <main className="flex min-w-0 flex-1 flex-col">
            <ViewTabs />
            <OperationBanner repoPath={activePath} />
            {viewMode === 'history' ? (
              <div className="flex min-h-0 flex-1">
                <section className="min-w-0 flex-1 border-r border-border">
                  <GraphView repoPath={activePath} />
                </section>
                <aside className="w-[420px] shrink-0">
                  <CommitDetail repoPath={activePath} />
                </aside>
              </div>
            ) : (
              <ChangesView repoPath={activePath} />
            )}
          </main>
        ) : (
          <WelcomeScreen />
        )}
      </div>
      <StatusBar />
      <FileInspector />
      <ReflogPanel />
      <Toasts />
    </div>
  )
}
