import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { RealmState } from '../rules/state'

interface Props {
  realm: RealmState
  mode: 'ongoing' | 'final'
  narrative: string
}

const COLOURS = {
  ink: '#2a221b',
  inkSoft: '#5b4f44',
  inkFaint: '#9a8d80',
  rule: '#b8a98e',
  paper: '#f7f1e5',
  wine: '#7c2230',
} as const

const styles = StyleSheet.create({
  // ---- Cover page ----
  coverPage: {
    backgroundColor: COLOURS.paper,
    padding: 48,
    flexDirection: 'column',
    color: COLOURS.ink,
    fontFamily: 'Times-Roman',
  },
  coverTitle: {
    fontSize: 36,
    fontFamily: 'Times-Bold',
    textAlign: 'center',
    marginTop: 24,
  },
  coverSubtitle: {
    fontSize: 14,
    color: COLOURS.inkSoft,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: 'Times-Italic',
  },
  coverRule: {
    marginTop: 18,
    marginBottom: 18,
    alignSelf: 'center',
    width: 80,
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.wine,
  },
  bannerWrap: {
    marginTop: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    height: 220,
    objectFit: 'cover',
    borderRadius: 6,
  },
  bannerFallback: {
    width: '100%',
    height: 220,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackLabel: {
    color: COLOURS.inkFaint,
    fontSize: 11,
    fontFamily: 'Times-Italic',
  },
  rulerRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: COLOURS.rule,
  },
  portrait: {
    width: 96,
    height: 96,
    borderRadius: 48,
    objectFit: 'cover',
  },
  portraitFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rulerMeta: {
    flexDirection: 'column',
    flex: 1,
  },
  rulerLabel: {
    fontSize: 10,
    color: COLOURS.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rulerName: {
    fontSize: 18,
    fontFamily: 'Times-Bold',
    marginTop: 2,
  },
  rulerCaption: {
    fontSize: 11,
    color: COLOURS.inkSoft,
    marginTop: 2,
    fontFamily: 'Times-Italic',
  },
  // ---- Narrative pages ----
  narrativePage: {
    backgroundColor: COLOURS.paper,
    padding: 56,
    color: COLOURS.ink,
    fontFamily: 'Times-Roman',
    fontSize: 12,
    lineHeight: 1.55,
  },
  narrativeHeader: {
    fontSize: 10,
    color: COLOURS.inkFaint,
    marginBottom: 18,
    textAlign: 'right',
    fontFamily: 'Times-Italic',
  },
  paragraph: {
    marginBottom: 10,
    textAlign: 'justify',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: COLOURS.inkFaint,
    fontSize: 9,
  },
})

/**
 * Splits a markdown-ish narrative into paragraphs. Models often emit
 * double-newlines between paragraphs; if not we fall back to single
 * newlines. Empty entries are dropped.
 */
function paragraphsOf(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const byDouble = trimmed.split(/\n\s*\n/)
  if (byDouble.length > 1) {
    return byDouble.map((p) => p.trim()).filter((p) => p.length > 0)
  }
  return trimmed.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0)
}

/**
 * @react-pdf/renderer document. Cover page on its own, then the narrative
 * flows across as many pages as needed (the library handles pagination
 * for long Text blocks automatically).
 *
 * Images are fetched at render time from their URLs — Supabase Storage
 * public buckets allow this. If the realm has no cover image or ruler
 * portrait, we render a dashed-border placeholder so the layout stays
 * intact.
 */
export function ChroniclePDF({ realm, mode, narrative }: Props) {
  const paragraphs = paragraphsOf(narrative)
  const subtitle =
    mode === 'final' ? 'A closed saga' : 'The story so far'
  const cover = realm.coverImageUrl ?? null
  const portrait = realm.rulerPortraitUrl ?? null

  return (
    <Document title={`Chronicle of ${realm.name}`} author="Empire RPG">
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverTitle}>Chronicle of {realm.name}</Text>
        <Text style={styles.coverSubtitle}>{subtitle}</Text>
        <View style={styles.coverRule} />

        <View style={styles.bannerWrap}>
          {cover ? (
            <Image style={styles.banner} src={cover} />
          ) : (
            <View style={styles.bannerFallback}>
              <Text style={styles.fallbackLabel}>
                (no cover image)
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rulerRow}>
          {portrait ? (
            <Image style={styles.portrait} src={portrait} />
          ) : (
            <View style={styles.portraitFallback}>
              <Text style={styles.fallbackLabel}>—</Text>
            </View>
          )}
          <View style={styles.rulerMeta}>
            <Text style={styles.rulerLabel}>Ruler</Text>
            <Text style={styles.rulerName}>{realm.ruler.name}</Text>
            <Text style={styles.rulerCaption}>
              {realm.scale.charAt(0).toUpperCase() + realm.scale.slice(1)} ·
              {' '}Year {realm.year} ·{' '}
              {realm.season.charAt(0).toUpperCase() + realm.season.slice(1)}
            </Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.narrativePage}>
        <Text style={styles.narrativeHeader} fixed>
          Chronicle of {realm.name}
        </Text>
        {paragraphs.length === 0 ? (
          <Text style={styles.paragraph}>(no narrative was generated)</Text>
        ) : (
          paragraphs.map((p, i) => (
            <Text key={i} style={styles.paragraph}>
              {p}
            </Text>
          ))
        )}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
