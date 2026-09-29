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
  /** Estampillas de categoría de regalo; ausente si search-logs.php es anterior a esa versión */
  giftBuckets?: SearchBucketCount[]
}
