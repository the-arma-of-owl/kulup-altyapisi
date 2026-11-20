'use client'

import React from 'react'

interface ExportButtonProps {
  collectionSlug?: string
}

export const ExportButton: React.FC<ExportButtonProps> = ({ collectionSlug = 'members' }) => {
  const handleExport = async () => {
    try {
      // Mevcut URL'deki query parametrelerini al (?where=... vb.)
      const search = window.location.search;
      const res = await fetch(`/api/${collectionSlug}/export-csv${search}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${collectionSlug}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error(err)
      alert('Dışa aktarma başarısız oldu.')
    }
  }

  return (
    <div style={{ padding: '12px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button
        onClick={handleExport}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          backgroundColor: '#16a34a',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '13px',
        }}
      >
        📥 Excel/CSV İndir
      </button>
      <span style={{ fontSize: '12px', color: '#888' }}>
        Tüm kayıtları CSV formatında indir (Excel ile açılabilir)
      </span>
    </div>
  )
}
