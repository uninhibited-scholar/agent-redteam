/**
 * useApi — generic data fetching hook with loading/error states.
 * Replaces scattered fetch() calls across pages.
 */
import { useState, useEffect } from 'react'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>(url: string | null): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null })
      return
    }

    setState({ data: null, loading: true, error: null })

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: null, loading: false, error: err.message }))
  }, [url])

  return state
}
