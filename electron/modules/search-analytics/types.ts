export interface SearchAnalyticsFilters {
  dateFrom?: string
  dateTo?: string
  /** Incluir búsquedas marcadas como internas (pruebas propias, ver search-logs.php) */
  includeInternal?: boolean
}

export interface SearchBucketCount {
  value: string
  label: string
  count: number
}

export interface SearchAnalyticsReport {
  totalSearches: number
  priceBuckets: SearchBucketCount[]
  ageBuckets: SearchBucketCount[]
  playersBuckets: SearchBucketCount[]
}
