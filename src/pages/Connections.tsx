import { writeClipboard } from '@solid-primitives/clipboard'
import { createEventSignal } from '@solid-primitives/event-listener'
import { useI18n } from '@solid-primitives/i18n'
import { makePersisted } from '@solid-primitives/storage'
import { createReconnectingWS } from '@solid-primitives/websocket'
import {
  IconCircleX,
  IconSettings,
  IconSortAscending,
  IconSortDescending,
  IconZoomInFilled,
  IconZoomOutFilled,
} from '@tabler/icons-solidjs'
import {
  ColumnDef,
  GroupingState,
  SortingState,
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
} from '@tanstack/solid-table'
import byteSize from 'byte-size'
import dayjs from 'dayjs'
import { isIPv6 } from 'is-ip'
import { For, createEffect, createSignal } from 'solid-js'
import { twMerge } from 'tailwind-merge'
import { Button, ConnectionsTableOrderingModal } from '~/components'
import {
  CONNECTIONS_TABLE_ACCESSOR_KEY,
  CONNECTIONS_TABLE_INITIAL_COLUMN_ORDER,
  CONNECTIONS_TABLE_INITIAL_COLUMN_VISIBILITY,
  TAILWINDCSS_SIZE,
} from '~/constants'
import { formatTimeFromNow } from '~/helpers'
import { secret, tableSize, useRequest, wsEndpointURL } from '~/signals'
import type { Connection } from '~/types'

type ConnectionWithSpeed = Connection & {
  downloadSpeed: number
  uploadSpeed: number
}

type ColumnVisibility = Partial<Record<CONNECTIONS_TABLE_ACCESSOR_KEY, boolean>>
type ColumnOrder = CONNECTIONS_TABLE_ACCESSOR_KEY[]

export default () => {
  const [t] = useI18n()
  const request = useRequest()

  const [search, setSearch] = createSignal('')

  const ws = createReconnectingWS(
    `${wsEndpointURL()}/connections?token=${secret()}`,
  )

  const messageEvent = createEventSignal<{
    message: WebSocketEventMap['message']
  }>(ws, 'message')

  const [connectionsWithSpeed, setConnectionsWithSpeed] = createSignal<
    ConnectionWithSpeed[]
  >([])

  createEffect(() => {
    const data = messageEvent()?.data

    if (!data) {
      return
    }

    setConnectionsWithSpeed((prevConnections) => {
      const prevMap = new Map<string, Connection>()
      prevConnections.forEach((prev) => prevMap.set(prev.id, prev))

      const connections = (
        JSON.parse(data) as { connections: Connection[] }
      ).connections.map((connection) => {
        const prevConn = prevMap.get(connection.id)

        if (!prevConn) {
          return { ...connection, downloadSpeed: 0, uploadSpeed: 0 }
        }

        return {
          ...connection,
          downloadSpeed: prevConn.download
            ? connection.download - prevConn.download
            : 0,
          uploadSpeed: prevConn.upload
            ? connection.upload - prevConn.upload
            : 0,
        }
      })

      return connections.slice(-100)
    })
  })

  const onCloseConnection = (id: string) => request.delete(`connections/${id}`)

  const [columnVisibility, setColumnVisibility] = makePersisted(
    createSignal<ColumnVisibility>(CONNECTIONS_TABLE_INITIAL_COLUMN_VISIBILITY),
    {
      name: 'columnVisibility',
      storage: localStorage,
    },
  )
  const [columnOrder, setColumnOrder] = makePersisted(
    createSignal<ColumnOrder>(CONNECTIONS_TABLE_INITIAL_COLUMN_ORDER),
    {
      name: 'columnOrder',
      storage: localStorage,
    },
  )

  const columns: ColumnDef<ConnectionWithSpeed>[] = [
    {
      header: () => t('close'),
      enableGrouping: false,
      enableSorting: false,
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Close,
      cell: ({ row }) => (
        <div class="flex h-4 items-center">
          <Button
            class="btn-circle btn-xs"
            onClick={() => onCloseConnection(row.id)}
          >
            <IconCircleX size="16" />
          </Button>
        </div>
      ),
    },
    {
      header: () => t('ID'),
      enableGrouping: false,
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.ID,
      accessorFn: (row) => row.id,
    },
    {
      header: () => t('type'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Type,
      accessorFn: (row) => `${row.metadata.type}(${row.metadata.network})`,
    },
    {
      header: () => t('process'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Process,
      accessorFn: (row) =>
        row.metadata.process ||
        row.metadata.processPath.replace(/^.*[/\\](.*)$/, '$1') ||
        '-',
    },
    {
      header: () => t('host'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Host,
      accessorFn: (row) =>
        `${
          row.metadata.host ? row.metadata.host : row.metadata.destinationIP
        }:${row.metadata.destinationPort}`,
    },
    {
      header: () => t('rules'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Rule,
      accessorFn: (row) =>
        !row.rulePayload ? row.rule : `${row.rule} :: ${row.rulePayload}`,
    },
    {
      header: () => t('chains'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Chains,
      accessorFn: (row) => row.chains.slice().reverse().join(' :: '),
    },
    {
      header: () => t('connectTime'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.ConnectTime,
      accessorFn: (row) => formatTimeFromNow(row.start),
      sortingFn: (prev, next) =>
        dayjs(prev.original.start).valueOf() -
        dayjs(next.original.start).valueOf(),
    },
    {
      header: () => t('dlSpeed'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.DlSpeed,
      accessorFn: (row) => `${byteSize(row.downloadSpeed)}/s`,
      sortingFn: (prev, next) =>
        prev.original.downloadSpeed - next.original.downloadSpeed,
    },
    {
      header: () => t('ulSpeed'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.ULSpeed,
      accessorFn: (row) => `${byteSize(row.uploadSpeed)}/s`,
      sortingFn: (prev, next) =>
        prev.original.uploadSpeed - next.original.uploadSpeed,
    },
    {
      header: () => t('dl'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Download,
      accessorFn: (row) => byteSize(row.download),
      sortingFn: (prev, next) =>
        prev.original.download - next.original.download,
    },
    {
      header: () => t('ul'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Upload,
      accessorFn: (row) => byteSize(row.upload),
      sortingFn: (prev, next) => prev.original.upload - next.original.upload,
    },
    {
      header: () => t('source'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Source,
      accessorFn: (row) =>
        isIPv6(row.metadata.sourceIP)
          ? `[${row.metadata.sourceIP}]:${row.metadata.sourcePort}`
          : `${row.metadata.sourceIP}:${row.metadata.sourcePort}`,
    },
    {
      header: () => t('destination'),
      accessorKey: CONNECTIONS_TABLE_ACCESSOR_KEY.Destination,
      accessorFn: (row) =>
        row.metadata.remoteDestination ||
        row.metadata.destinationIP ||
        row.metadata.host,
    },
  ]

  const [grouping, setGrouping] = createSignal<GroupingState>([])
  const [sorting, setSorting] = createSignal<SortingState>([
    { id: CONNECTIONS_TABLE_ACCESSOR_KEY.ConnectTime, desc: true },
  ])

  const table = createSolidTable({
    state: {
      get columnOrder() {
        return columnOrder()
      },
      get grouping() {
        return grouping()
      },
      get sorting() {
        return sorting()
      },
      get columnVisibility() {
        return columnVisibility()
      },
      get globalFilter() {
        return search()
      },
    },
    get data() {
      return connectionsWithSpeed()
    },
    sortDescFirst: true,
    enableHiding: true,
    columns,
    onGlobalFilterChange: setSearch,
    onGroupingChange: setGrouping,
    onSortingChange: setSorting,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getCoreRowModel: getCoreRowModel(),
  })

  const tableSizeClassName = () => {
    const size = tableSize()

    if (size === TAILWINDCSS_SIZE.XS) {
      return 'table-xs'
    }

    if (size === TAILWINDCSS_SIZE.SM) {
      return 'table-sm'
    }

    if (size === TAILWINDCSS_SIZE.MD) {
      return 'table-md'
    }

    if (size === TAILWINDCSS_SIZE.LG) {
      return 'table-lg'
    }

    return ''
  }

  return (
    <div class="flex h-full flex-col gap-4 overflow-y-auto p-1">
      <div class="tabs-boxed tabs">
        <a class="tab tab-active">
          {t('activeConnections')} ({connectionsWithSpeed().length})
        </a>
      </div>

      <div class="flex w-full items-center gap-2">
        <input
          class="input input-primary flex-1"
          placeholder={t('search')}
          onInput={(e) => setSearch(e.target.value)}
        />

        <Button
          class="btn-circle"
          onClick={() => request.delete('connections')}
        >
          <IconCircleX />
        </Button>

        <label for="connection-modal" class="btn btn-circle">
          <IconSettings />
        </label>

        <ConnectionsTableOrderingModal
          order={columnOrder()}
          visible={columnVisibility()}
          onOrderChange={(data: ColumnOrder) => {
            setColumnOrder([...data])
          }}
          onVisibleChange={(data: ColumnVisibility) =>
            setColumnVisibility({ ...data })
          }
        />
      </div>

      <div class="overflow-x-auto whitespace-nowrap rounded-md bg-base-300">
        <table
          class={twMerge(
            tableSizeClassName(),
            'table table-zebra relative rounded-none',
          )}
        >
          <thead class="sticky top-0 z-10 h-8">
            <For each={table.getHeaderGroups()}>
              {(headerGroup) => (
                <tr>
                  <For each={headerGroup.headers}>
                    {(header) => (
                      <th class="bg-base-200">
                        <div class={twMerge('flex items-center gap-2')}>
                          {header.column.getCanGroup() ? (
                            <button
                              class="cursor-pointer"
                              onClick={header.column.getToggleGroupingHandler()}
                            >
                              {header.column.getIsGrouped() ? (
                                <IconZoomOutFilled size={18} />
                              ) : (
                                <IconZoomInFilled size={18} />
                              )}
                            </button>
                          ) : null}

                          <div
                            class={twMerge(
                              header.column.getCanSort() &&
                                'cursor-pointer select-none',
                              'flex-1',
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </div>

                          {{
                            asc: <IconSortAscending />,
                            desc: <IconSortDescending />,
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      </th>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </thead>

          <tbody>
            <For each={table.getRowModel().rows}>
              {(row) => (
                <tr class="h-8 hover:!bg-primary hover:text-primary-content">
                  <For each={row.getVisibleCells()}>
                    {(cell) => (
                      <td
                        onContextMenu={(e) => {
                          e.preventDefault()
                          typeof cell.renderValue() === 'string' &&
                            void writeClipboard(cell.renderValue() as string)
                        }}
                      >
                        {cell.getIsGrouped() ? (
                          <button
                            class={twMerge(
                              row.getCanExpand()
                                ? 'cursor-pointer'
                                : 'cursor-normal',
                              'flex items-center gap-2',
                            )}
                            onClick={row.getToggleExpandedHandler()}
                          >
                            <div>
                              {row.getIsExpanded() ? (
                                <IconZoomOutFilled size={18} />
                              ) : (
                                <IconZoomInFilled size={18} />
                              )}
                            </div>
                            <div>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </div>

                            <div>({row.subRows.length})</div>
                          </button>
                        ) : cell.getIsAggregated() ? (
                          flexRender(
                            cell.column.columnDef.aggregatedCell ??
                              cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        ) : cell.getIsPlaceholder() ? null : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        )}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  )
}
