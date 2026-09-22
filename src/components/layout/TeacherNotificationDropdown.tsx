import React from 'react';
import { TeacherMessagingBar } from '../messaging/TeacherMessagingBar.tsx';

/**
 * Replaced one-way notifications with the full 2-Way Messaging System bar
 */
export const TeacherNotificationDropdown: React.FC = () => {
  return <TeacherMessagingBar />;
};
