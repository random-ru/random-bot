import path from 'path'
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import { TrustAnalytics } from '@shared/api/trust/types'
import { ChatMember } from 'grammy/types'

const FONT_PT_SANS = 'PT Sans'
const FONT_PT_SANS_NARROW = 'PT Sans Narrow'
Font.register({
  family: FONT_PT_SANS,
  src: path.join(process.cwd(), 'fonts', 'PTSans-Regular.ttf'),
  fontWeight: 'normal',
})
Font.register({
  family: FONT_PT_SANS,
  src: path.join(process.cwd(), 'fonts', 'PTSans-Bold.ttf'),
  fontWeight: 'bold',
})
Font.register({
  family: FONT_PT_SANS_NARROW,
  src: path.join(process.cwd(), 'fonts', 'PTSansNarrow-Regular.ttf'),
})
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/',
})

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#fff',
    margin: '0.5cm',
  },
  logoWrapper: {
    width: '9.5cm',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: { width: 100 },
  reportGenerationTime: {
    fontFamily: FONT_PT_SANS_NARROW,
    fontSize: 10,
    lineHeight: 1,
    marginBottom: 8,
  },
  userProfile: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    marginRight: 8,
  },
  userInfo: {},
  fullName: { fontFamily: FONT_PT_SANS, fontSize: 12, lineHeight: 1 },
  userID: { fontFamily: FONT_PT_SANS, fontSize: 10, lineHeight: 1 },
  username: { fontFamily: FONT_PT_SANS, fontSize: 10, lineHeight: 1 },
  sectionTitle: {
    fontFamily: FONT_PT_SANS,
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '9.5cm',
    marginBottom: 8,
    marginTop: 16,
  },
  table: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: '9.5cm',
  },
  col: {
    alignItems: 'center',
  },
  summaryHeaderCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 12,
    lineHeight: 1,
    marginBottom: 6,
  },
  summaryBodyCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 14,
    lineHeight: 1,
    fontWeight: 'bold',
  },
  factorsTable: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '9.5cm',
  },
  factorsCol: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  factorsHeaderCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 12,
    lineHeight: 1,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  factorsBodyCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 12,
    lineHeight: 1,
    marginBottom: 2,
  },
})

interface ReportDocumentProps {
  user: ChatMember
  trustAnalytics: TrustAnalytics
}
const ReportDocument = ({ trustAnalytics, user }: ReportDocumentProps) => {
  const { factors, trust_factor, accuracy, verdict, report_creation_date } =
    trustAnalytics
  const generationDateString = new Date(
    report_creation_date * 1000,
  ).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    timeStyle: 'short',
    dateStyle: 'short',
  })
  const fullName = [user.user.first_name, user.user.last_name].join(' ')

  return (
    <Document>
      <Page size="A6" style={styles.page}>
        <View style={styles.logoWrapper}>
          <Image
            src={'https://trust-tg-app.0xf6.moe/logo-group.png'}
            style={styles.logo}
          />
        </View>
        <Text style={styles.reportGenerationTime}>
          Generated on the {generationDateString}
        </Text>
        <View style={styles.userProfile}>
          <Image
            src={'https://avatars.githubusercontent.com/u/4393143?v=4'}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.fullName}>{fullName}</Text>
            <Text style={styles.userID}>ID: {user.user.id}</Text>
            <Text style={styles.username}>
              {user.user.username && '@'}
              {user.user.username}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.table}>
          <View style={styles.col}>
            <Text style={styles.summaryHeaderCell}>Verdict</Text>
            <Text style={styles.summaryBodyCell}>
              {verdict.replace(/Stage/i, '')}
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.summaryHeaderCell}>TrustFactor</Text>
            <Text style={styles.summaryBodyCell}>{trust_factor}/100</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.summaryHeaderCell}>Accuracy</Text>
            <Text style={styles.summaryBodyCell}>{accuracy}%</Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Factors</Text>
        <View style={styles.factorsTable}>
          <View style={styles.factorsCol}>
            <Text style={styles.factorsHeaderCell}>Sampler</Text>
            {factors.map((factor) => (
              <Text key={factor.sampler} style={styles.factorsBodyCell}>
                {factor.sampler}
              </Text>
            ))}
          </View>
          <View style={styles.factorsCol}>
            <Text style={styles.factorsHeaderCell}>Score</Text>
            {factors.map((factor) => (
              <Text key={factor.sampler} style={styles.factorsBodyCell}>
                {factor.score}
              </Text>
            ))}
          </View>
          <View style={styles.factorsCol}>
            <Text style={styles.factorsHeaderCell}>Max Score</Text>
            {factors.map((factor) => (
              <Text key={factor.sampler} style={styles.factorsBodyCell}>
                {factor.max_score}
              </Text>
            ))}
          </View>
          <View style={styles.factorsCol}>
            <Text style={styles.factorsHeaderCell}>Accuracy</Text>
            {factors.map((factor) => (
              <Text key={factor.sampler} style={styles.factorsBodyCell}>
                {factor.accuracy}%
              </Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  )
}
export function createReportPDF(
  trustAnalytics: TrustAnalytics,
  chatMember: ChatMember,
) {
  return renderToBuffer(
    <ReportDocument trustAnalytics={trustAnalytics} user={chatMember} />,
  )
}
