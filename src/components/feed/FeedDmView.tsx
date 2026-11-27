import { useState } from 'react';
import type { Conversation } from '../../types/models';
import { CallProvider } from '../../contexts/CallContext';
import { FoldersProvider } from '../../contexts/FoldersContext';
import { FriendsProvider } from '../../contexts/FriendsContext';
import { MessengerProvider, useMessenger } from '../../contexts/MessengerContext';
import { StarProvider } from '../../contexts/StarContext';
import { useAndroidBack } from '../../utils/androidBack';
import { CallOverlay } from '../call/CallOverlay';
import type { ConversationAction, ConversationTarget } from '../chat/ConversationActionModal';
import { ConversationActionModal } from '../chat/ConversationActionModal';
import { ChatPlaceholder } from '../chat/ChatPlaceholder';
import { ChatWindow } from '../chat/ChatWindow';
import { NewChatModal } from '../chat/NewChatModal';
import { ToastStack } from '../common/ToastStack';
import { ProfileModal } from '../profile/ProfileModal';
import { UserProfileModal } from '../profile/UserProfileModal';
import type { ReportTarget } from '../moderation/ReportModal';
import { ReportModal } from '../moderation/ReportModal';
import { ConversationSidebar } from '../layout/ConversationSidebar';

function DmLayout({ onBack }: { onBack: () => void }) {
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [chatAction, setChatAction] = useState<ConversationTarget | null>(null);
  const { activeConversation, mobileChatOpen, notifications, dismissNotification, openNotification, selectHome } = useMessenger();

  useAndroidBack(() => {
    if (chatAction) { setChatAction(null); return true; }
    if (report) { setReport(null); return true; }
    if (previewUserId) { setPreviewUserId(null); return true; }
    if (newChatOpen || profileOpen) { setNewChatOpen(false); setProfileOpen(false); return true; }
    if (activeConversation || mobileChatOpen) { selectHome(); return true; }
    onBack();
    return true;
  }, 140);

  const openChatAction = (conversation: Conversation, action: ConversationAction) => setChatAction({ conversation, action });

  return (
    <div className="ig-dm-shell" aria-label="Повідомлення Miston">
      <div className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 md:flex-none md:w-[340px]`}>
        <ConversationSidebar
          compact
          onBack={onBack}
          onNewChat={() => setNewChatOpen(true)}
          onProfile={() => setProfileOpen(true)}
          onOpenMenu={() => undefined}
          onOpenUser={setPreviewUserId}
          onAction={openChatAction}
          onReportUser={(userId) => setReport({ userId })}
        />
      </div>
      <main className={`${mobileChatOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
        {activeConversation ? (
          <ChatWindow onOpenUser={setPreviewUserId} onReport={setReport} onAction={openChatAction} />
        ) : (
          <ChatPlaceholder onNewChat={() => setNewChatOpen(true)} onCreateChannel={() => setNewChatOpen(true)} />
        )}
      </main>

      <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <UserProfileModal userId={previewUserId} onClose={() => setPreviewUserId(null)} onReport={setReport} />
      <ReportModal target={report} onClose={() => setReport(null)} />
      {chatAction && <ConversationActionModal target={chatAction} onClose={() => setChatAction(null)} />}
      <ToastStack notifications={notifications} onDismiss={dismissNotification} onOpen={openNotification} />
      <CallOverlay />
    </div>
  );
}

/** Instagram-подібні DM всередині окремого сайту стрічки, на API й сокеті Miston. */
export function FeedDmView({ onBack }: { onBack: () => void }) {
  return (
    <StarProvider>
      <MessengerProvider>
        <FriendsProvider>
          <FoldersProvider>
            <CallProvider>
              <DmLayout onBack={onBack} />
            </CallProvider>
          </FoldersProvider>
        </FriendsProvider>
      </MessengerProvider>
    </StarProvider>
  );
}
