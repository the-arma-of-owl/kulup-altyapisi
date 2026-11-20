import { headers as getHeaders } from 'next/headers.js'
import Image from 'next/image'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import './styles.css'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  return (
    <div className="home" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f9f9f9', fontFamily: 'sans-serif', textAlign: 'center', padding: '2rem' }}>
      <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
        <h1 style={{ color: '#d32f2f', marginBottom: '1.5rem', fontSize: '2rem' }}>⚠️ Uyarı</h1>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6', color: '#333' }}>
          Lütfen yetkili kişi değilseniz bu kısımdan uzak durun.
        </p>
        <p style={{ fontSize: '1.1rem', lineHeight: '1.6', color: '#555', marginTop: '1rem' }}>
          Sitede bir güvenlik açığı bulursanız lütfen yönetici ile iletişime geçin.
        </p>
        {user && (
          <div style={{ marginTop: '2rem' }}>
            <p style={{ marginBottom: '1rem' }}>Hoş geldin, {user.email}</p>
            <a
              href={payloadConfig.routes.admin}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '6px',
                fontWeight: 'bold'
              }}
            >
              Yönetim Paneline Git
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
