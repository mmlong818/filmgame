import type { Metadata } from 'next'
import { Courier_Prime } from 'next/font/google'
import './globals.css'
import { ToastProvider } from './components/toast'
import { CommandPalette } from './components/command-palette'

const courierPrime = Courier_Prime({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-courier-prime',
})

export const metadata: Metadata = {
  title: '影游设计工具',
  description: '互动影游全流程案头设计系统',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${courierPrime.variable} min-h-screen`}>
        <ToastProvider>
          {children}
          <CommandPalette />
        </ToastProvider>
      </body>
    </html>
  )
}
