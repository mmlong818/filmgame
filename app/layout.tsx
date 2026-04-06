import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ToastProvider } from './components/toast'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: '影游设计工具',
  description: '互动影游全流程案头设计系统',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${geist.variable} ${geistMono.variable} min-h-screen bg-white`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
