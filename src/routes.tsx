import type { RouteObject } from 'react-router'
import { Layout } from './ui/Layout'
import { Course } from './ui/pages/Course'
import { Dashboard } from './ui/pages/Dashboard'
import { ExamResults } from './ui/pages/ExamResults'
import { Exams } from './ui/pages/Exams'
import { Lesson } from './ui/pages/Lesson'
import { NotFound } from './ui/pages/NotFound'
import { Practice } from './ui/pages/Practice'
import { Review } from './ui/pages/Review'
import { Settings } from './ui/pages/Settings'
import { TakeExam } from './ui/pages/TakeExam'

// The review page loads on demand, and only behind import.meta.env.DEV, which a production build
// replaces with false, so the build drops the import and ships none of the page's code.
const loadContentReview = import.meta.env.DEV
  ? async () => ({ Component: (await import('./ui/pages/ContentReview')).ContentReview })
  : undefined

export function buildRoutes(dev: boolean): RouteObject[] {
  const devRoutes: RouteObject[] =
    dev && loadContentReview ? [{ path: 'dev/content', lazy: loadContentReview }] : []
  return [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'course', element: <Course /> },
      { path: 'course/:lessonId', element: <Lesson /> },
      { path: 'review', element: <Review /> },
      { path: 'practice', element: <Practice /> },
      { path: 'exams', element: <Exams /> },
      { path: 'exams/mock', element: <TakeExam mode="mock" /> },
      { path: 'exams/:examId', element: <TakeExam /> },
      { path: 'results/:sessionId', element: <ExamResults /> },
      { path: 'settings', element: <Settings /> },
      ...devRoutes,
      { path: '*', element: <NotFound /> },
    ],
  },
]
}

export const routes: RouteObject[] = buildRoutes(import.meta.env.DEV)
