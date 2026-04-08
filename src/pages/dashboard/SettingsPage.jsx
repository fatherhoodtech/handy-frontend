import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function SettingsPage() {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Configuration placeholders for your sales dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-zinc-700">
        <p>- Profile settings</p>
        <p>- Team permissions</p>
        <p>- Notification preferences</p>
        <p>- Integration keys</p>
      </CardContent>
    </Card>
  )
}

export default SettingsPage
