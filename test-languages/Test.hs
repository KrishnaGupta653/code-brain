-- Haskell test file
module CodeBrain.User where

import Data.Maybe (Maybe)
import qualified Data.Map as Map

data User = User
  { userId :: Int
  , userName :: String
  , userEmail :: String
  } deriving (Show, Eq)

type UserMap = Map.Map Int User

class UserService a where
  getUser :: a -> Int -> Maybe User
  createUser :: a -> User -> a

data UserServiceImpl = UserServiceImpl
  { users :: UserMap
  }

instance UserService UserServiceImpl where
  getUser service uid = Map.lookup uid (users service)
  createUser service user = service { users = Map.insert (userId user) user (users service) }

createUser :: Int -> String -> String -> User
createUser uid name email = User uid name email

displayName :: User -> String
displayName user = userName user ++ " (" ++ userEmail user ++ ")"

emptyService :: UserServiceImpl
emptyService = UserServiceImpl Map.empty
