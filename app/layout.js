import './globals.css'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { ThemeProvider } from './context/ThemeContext'

export const metadata = { title: 'Interview Coach', description: 'PM Interview Analyzer' }

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Open+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <ThemeProvider>
          <Nav />
          <main style={{ flex: 1, paddingBottom: 48 }}>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
