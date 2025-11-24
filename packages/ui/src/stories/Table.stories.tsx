/**
 * Table Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '../components/Table';
import { Badge } from '../components/Badge';
import { IconButton } from '../components/IconButton';

const meta = {
  title: 'Components/Table',
  component: Table,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Table component for displaying tabular data with support for sorting, hoverable rows, and striped styling.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>John Doe</TableCell>
          <TableCell>john@example.com</TableCell>
          <TableCell>Admin</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Jane Smith</TableCell>
          <TableCell>jane@example.com</TableCell>
          <TableCell>User</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Bob Johnson</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>User</TableCell>
          <TableCell>Inactive</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>List of registered users</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>John Doe</TableCell>
          <TableCell>john@example.com</TableCell>
          <TableCell>Admin</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Jane Smith</TableCell>
          <TableCell>jane@example.com</TableCell>
          <TableCell>User</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const Hoverable: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Patient Name</TableHead>
          <TableHead>MRN</TableHead>
          <TableHead>Last Visit</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow hoverable>
          <TableCell>Sarah Williams</TableCell>
          <TableCell>MRN-001234</TableCell>
          <TableCell>2024-01-15</TableCell>
          <TableCell>
            <Badge variant="success">Active</Badge>
          </TableCell>
        </TableRow>
        <TableRow hoverable>
          <TableCell>Michael Chen</TableCell>
          <TableCell>MRN-001235</TableCell>
          <TableCell>2024-01-10</TableCell>
          <TableCell>
            <Badge variant="warning">Follow-up</Badge>
          </TableCell>
        </TableRow>
        <TableRow hoverable>
          <TableCell>Emily Davis</TableCell>
          <TableCell>MRN-001236</TableCell>
          <TableCell>2024-01-05</TableCell>
          <TableCell>
            <Badge variant="default">Discharged</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Hoverable rows for interactive tables.',
      },
    },
  },
};

export const Striped: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Medication</TableHead>
          <TableHead>Dosage</TableHead>
          <TableHead>Frequency</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody striped>
        <TableRow>
          <TableCell>1</TableCell>
          <TableCell>Aspirin</TableCell>
          <TableCell>100mg</TableCell>
          <TableCell>Once daily</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>2</TableCell>
          <TableCell>Metformin</TableCell>
          <TableCell>500mg</TableCell>
          <TableCell>Twice daily</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>3</TableCell>
          <TableCell>Lisinopril</TableCell>
          <TableCell>10mg</TableCell>
          <TableCell>Once daily</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>4</TableCell>
          <TableCell>Atorvastatin</TableCell>
          <TableCell>20mg</TableCell>
          <TableCell>Once daily</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Striped rows for better readability.',
      },
    },
  },
};

export const Sortable: Story = {
  render: function SortableTable() {
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

    const handleSort = (column: string) => {
      if (sortColumn === column) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    };

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              sortable
              sortDirection={sortColumn === 'name' ? sortDirection : null}
              onSort={() => handleSort('name')}
            >
              Name
            </TableHead>
            <TableHead
              sortable
              sortDirection={sortColumn === 'age' ? sortDirection : null}
              onSort={() => handleSort('age')}
            >
              Age
            </TableHead>
            <TableHead
              sortable
              sortDirection={sortColumn === 'date' ? sortDirection : null}
              onSort={() => handleSort('date')}
            >
              Date
            </TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice Brown</TableCell>
            <TableCell>28</TableCell>
            <TableCell>2024-01-20</TableCell>
            <TableCell>
              <Badge variant="success">Active</Badge>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Bob Wilson</TableCell>
            <TableCell>35</TableCell>
            <TableCell>2024-01-18</TableCell>
            <TableCell>
              <Badge variant="warning">Pending</Badge>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Carol Martinez</TableCell>
            <TableCell>42</TableCell>
            <TableCell>2024-01-15</TableCell>
            <TableCell>
              <Badge variant="default">Completed</Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Sortable columns with visual indicators.',
      },
    },
  },
};

export const WithActions: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Patient</TableHead>
          <TableHead>Appointment</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow hoverable>
          <TableCell>Dr. Sarah Johnson</TableCell>
          <TableCell>2024-01-25 10:00 AM</TableCell>
          <TableCell>Consultation</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <IconButton
                variant="ghost"
                size="sm"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                }
                aria-label="Edit"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                }
                aria-label="Delete"
              />
            </div>
          </TableCell>
        </TableRow>
        <TableRow hoverable>
          <TableCell>Dr. Michael Lee</TableCell>
          <TableCell>2024-01-25 2:00 PM</TableCell>
          <TableCell>Follow-up</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <IconButton
                variant="ghost"
                size="sm"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                }
                aria-label="Edit"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                }
                aria-label="Delete"
              />
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Table with action buttons for each row.',
      },
    },
  },
};

export const WithFooter: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead className="text-right">Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Medical Supplies</TableCell>
          <TableCell>10</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Lab Tests</TableCell>
          <TableCell>5</TableCell>
          <TableCell className="text-right">$180.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Consultation</TableCell>
          <TableCell>1</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className="text-right font-bold">$580.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Table with footer for totals or summary information.',
      },
    },
  },
};
