import type { Staff } from '@app/types'

interface Window {
  staff: {
    list: () => Promise<Staff[]>
    create: (firstName: string, lastName: string) => Promise<Staff>
  }
}
